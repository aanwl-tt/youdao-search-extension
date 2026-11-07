/**
 * 有道词典划词搜索 - Background Service Worker (Manifest V3)
 */

const DEFAULT_SETTINGS = {
  enableFloating: true,
  openInBackground: false,
  buttonPosition: "bottom",
  clickAction: "popup" // "popup" (浮窗显示释义) 或 "tab" (新标签页打开)
};

// 构造有道网页搜索链接
function buildYoudaoUrl(word) {
  const cleanWord = (word || "").trim().slice(0, 300);
  return `https://dict.youdao.com/w/${encodeURIComponent(cleanWord)}`;
}

// 专门的有道机器翻译引擎（用于长句、整段或词典未收录短语）
async function queryYoudaoTranslation(text) {
  const cleanText = (text || "").trim().slice(0, 800);
  if (!cleanText) return null;

  // 通道 1: aidemo.youdao.com 官方开放 JSON 翻译接口 (速度极快，结果与网页一致)
  try {
    const resp = await fetch("https://aidemo.youdao.com/trans", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `q=${encodeURIComponent(cleanText)}&from=Auto&to=Auto`
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.translation && Array.isArray(data.translation) && data.translation.length > 0) {
        const transStr = data.translation.join("\n").trim();
        if (transStr) return transStr;
      }
    }
  } catch (e) {
    // 忽略通道 1 异常，走通道 2 兜底
  }

  // 通道 2: dict.youdao.com/w/ 网页端 SSR 机器翻译解析兜底
  try {
    const webUrl = `https://dict.youdao.com/w/${encodeURIComponent(cleanText)}`;
    const resp = await fetch(webUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    if (resp.ok) {
      const html = await resp.text();
      const match = html.match(/<div id="fanyiToggle"[^>]*>[\s\S]*?<div class="trans-container">[\s\S]*?<p>[\s\S]*?<\/p>\s*<p>([\s\S]*?)<\/p>/i);
      if (match && match[1]) {
        const cleanTrans = match[1]
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"')
          .trim();
        if (cleanTrans) return cleanTrans;
      }
    }
  } catch (e) {
    // 捕获异常
  }

  return null;
}

// 内存 LRU 缓存：避免同篇论文内重复词汇重复发起网络请求，实现 0ms 瞬间回显
const DEFINITION_CACHE_MAX = 200;
const definitionCache = new Map();

function saveToDefinitionCache(key, data) {
  if (!key || !data) return;
  if (definitionCache.size >= DEFINITION_CACHE_MAX) {
    const oldestKey = definitionCache.keys().next().value;
    definitionCache.delete(oldestKey);
  }
  definitionCache.set(key, data);
}

// 查询有道词典 API 获取释义与音标
async function queryYoudaoDefinition(word) {
  const cleanWord = (word || "").trim().slice(0, 800);
  if (!cleanWord) return { success: false, error: "Empty query" };

  const cacheKey = cleanWord.toLowerCase();
  if (definitionCache.has(cacheKey)) {
    const cached = definitionCache.get(cacheKey);
    definitionCache.delete(cacheKey);
    definitionCache.set(cacheKey, cached);
    return { success: true, data: cached };
  }

  // 放宽短语/多词搭配判定（4~6 词常用搭配优先尝试词典/短语库查询，避免直接被当成整句跳过四六级与权威词典释义）
  const words = cleanWord.trim().split(/\s+/);
  const wordCount = words.length;
  const hasSentencePunctuation = /[.?!;:]\s|\n|[.?!;:]$/.test(cleanWord);
  const isDirectSentence = cleanWord.length > 80 || hasSentencePunctuation || wordCount > 6;
  const isSentence = isDirectSentence;

  const result = {
    word: cleanWord,
    phonetic: "",
    audioUrl: `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(cleanWord)}&type=2`,
    audioUrlUs: `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(cleanWord)}&type=2`,
    audioUrlUk: `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(cleanWord)}&type=1`,
    explains: [],
    isSentence: isSentence,
    cetTag: "" // "CET4", "CET6", 或空字符串
  };

  try {
    // 若识别为超长段落或带标点的完整整句，直接优先调用机器翻译
    if (isDirectSentence) {
      const trans = await queryYoudaoTranslation(cleanWord);
      if (trans) {
        result.isSentence = true;
        result.explains.push(trans);
        saveToDefinitionCache(cacheKey, result);
        return { success: true, data: result };
      }
    }

    // 1. 主接口：查询 JSONAPI (包含音标、英汉/汉英详细词典释义及四六级标签)
    const jsonUrl = `https://dict.youdao.com/jsonapi?q=${encodeURIComponent(cleanWord)}`;
    const resp = await fetch(jsonUrl, { cache: "force-cache" });
    if (resp.ok) {
      const data = await resp.json();

      // 提取四六级标签 (优先 Collins, 其次 EC)
      if (!result.isSentence) {
        let cet = "";
        try {
          const entriesRaw = data.collins && data.collins.collins_entries;
          const entries = Array.isArray(entriesRaw) ? entriesRaw : (entriesRaw ? [entriesRaw] : []);
          for (const entry of entries) {
            const besRaw = entry.basic_entries && entry.basic_entries.basic_entry;
            const bes = Array.isArray(besRaw) ? besRaw : (besRaw ? [besRaw] : []);
            for (const b of bes) {
              const c = (b.cet || "").toUpperCase();
              if (c.includes("CET4")) {
                cet = "CET4";
                break;
              } else if (c.includes("CET6")) {
                cet = "CET6";
                break;
              }
            }
            if (cet) break;
          }
        } catch (e) {}

        if (!cet && data.ec && Array.isArray(data.ec.exam_type)) {
          const et = data.ec.exam_type.map((x) => String(x).toUpperCase());
          if (et.includes("CET4")) {
            cet = "CET4";
          } else if (et.includes("CET6")) {
            cet = "CET6";
          }
        }

        if (cet === "CET4" || cet === "CET6") {
          result.cetTag = cet;
        }
      }

      // 英汉词典 (EC)
      if (data.ec && data.ec.word && data.ec.word[0]) {
        const w = data.ec.word[0];
        if (w.usphone) result.phonetic = `美 [${w.usphone}]`;
        else if (w.ukphone) result.phonetic = `英 [${w.ukphone}]`;

        if (w.trs && Array.isArray(w.trs)) {
          w.trs.forEach((item) => {
            if (item.tr && Array.isArray(item.tr)) {
              item.tr.forEach((sub) => {
                if (sub.l && sub.l.i) {
                  const texts = sub.l.i.filter((t) => typeof t === "string" && t.trim());
                  if (texts.length) result.explains.push(texts.join(" "));
                }
              });
            }
          });
        }
      }

      // 汉英词典 (CE)：同时提取英文对应词 (sub.l.i) 与中文释义 (sub.l["#tran"])
      if (!result.explains.length && data.ce && data.ce.word) {
        const ceWords = Array.isArray(data.ce.word) ? data.ce.word : [data.ce.word];
        ceWords.forEach((w) => {
          if (w.phone && !result.phonetic) result.phonetic = `[${w.phone}]`;
          if (w.trs) {
            w.trs.forEach((item) => {
              if (item.tr) {
                item.tr.forEach((sub) => {
                  if (sub.l) {
                    const enStr = (Array.isArray(sub.l.i) ? sub.l.i : [sub.l.i])
                      .map((t) => (typeof t === "string" ? t : (t && t["#text"]) || ""))
                      .join("")
                      .trim();
                    const pos = sub.l.pos ? `${sub.l.pos} ` : "";
                    const tran = sub.l["#tran"] ? sub.l["#tran"].replace(/；$/, "") : "";

                    if (enStr && tran) {
                      result.explains.push(`${pos}${enStr}（${tran}）`);
                    } else if (enStr) {
                      result.explains.push(`${pos}${enStr}`);
                    } else if (tran) {
                      result.explains.push(tran);
                    }
                  }
                });
              }
            });
          }
        });
      }

      // 网络释义 (web_trans) 备用
      if (!result.explains.length && data.web_trans && data.web_trans["web-translation"]) {
        data.web_trans["web-translation"].slice(0, 3).forEach((item) => {
          const trans = (item.trans || []).map((t) => t.value).filter(Boolean);
          if (item.key && trans.length) {
            result.explains.push(`${item.key}: ${trans.join(", ")}`);
          }
        });
      }
    }

    // 2. 备用接口：如果词组未匹配到词条，调用 Suggest 接口补全短语释义
    if (!result.explains.length) {
      const sugUrl = `https://dict.youdao.com/suggest?q=${encodeURIComponent(cleanWord)}&num=4&doctype=json`;
      const sugResp = await fetch(sugUrl);
      if (sugResp.ok) {
        const sugData = await sugResp.json();
        if (sugData.data && Array.isArray(sugData.data.entries)) {
          sugData.data.entries.forEach((e) => {
            if (e.explain && !result.explains.includes(e.explain)) {
              result.explains.push(e.explain);
            }
          });
        }
      }
    }

    // 3. 兜底保障：若词典与联想接口皆无结果，统一调用机器翻译补齐长句或短语释义
    if (!result.explains.length) {
      const trans = await queryYoudaoTranslation(cleanWord);
      if (trans) {
        result.isSentence = true;
        result.cetTag = "";
        result.explains.push(trans);
      }
    }

    saveToDefinitionCache(cacheKey, result);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: err.message, data: result };
  }
}

// 打开有道网页搜索
async function performSearch(word, senderTab = null, forceInBackground = null) {
  if (!word || !word.trim()) return;

  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS).catch(() => DEFAULT_SETTINGS);
  const active = forceInBackground !== null ? !forceInBackground : !settings.openInBackground;
  const targetUrl = buildYoudaoUrl(word);

  let targetIndex;
  if (senderTab && typeof senderTab.index === "number") {
    targetIndex = senderTab.index + 1;
  }

  await chrome.tabs.create({
    url: targetUrl,
    active: active,
    index: targetIndex
  });
}

// 打开内置 PDF 阅读器
async function openPdfReader() {
  const readerUrl = chrome.runtime.getURL("reader.html");
  await chrome.tabs.create({ url: readerUrl });
}

// 初始化右键菜单与默认配置
chrome.runtime.onInstalled.addListener(async () => {
  const currentSettings = await chrome.storage.sync.get(null).catch(() => ({}));
  if (currentSettings.enableFloating === undefined) {
    await chrome.storage.sync.set(DEFAULT_SETTINGS).catch(() => {});
  }

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "searchYoudao",
      title: "在有道词典中搜索 \"%s\"",
      contexts: ["selection"]
    });
    chrome.contextMenus.create({
      id: "openPdfReaderMenu",
      title: "📖 打开有道 PDF 沉浸式阅读器",
      contexts: ["page", "action"]
    });
  });
});

// 监听右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "searchYoudao" && info.selectionText) {
    performSearch(info.selectionText, tab);
  } else if (info.menuItemId === "openPdfReaderMenu") {
    openPdfReader();
  }
});

// 监听通信消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) return;

  if (message.action === "queryWord") {
    queryYoudaoDefinition(message.word).then(sendResponse);
    return true; // 异步响应
  }

  if (message.action === "searchWord") {
    performSearch(message.word, sender.tab, message.inBackground)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === "openReader") {
    openPdfReader()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});
