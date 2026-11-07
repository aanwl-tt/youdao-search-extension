/**
 * 有道词典划词搜索 - Content Script
 * 采用 Shadow DOM 隔离技术，支持划词浮标与就地释义浮窗
 */

(() => {
  // 防止双重执行：reader.html 手动引入 + manifest content_scripts 自动注入时
  if (document.getElementById("youdao-dict-extension-host")) return;

  let isFloatingEnabled = true;
  let buttonPosition = "bottom"; // "bottom", "right", "top"
  let clickAction = "popup";      // "popup" (浮窗显示释义) 或 "tab" (新标签页打开)
  let selectedWord = "";
  
  let hostElement = null;
  let shadowRoot = null;
  let floatingBtn = null;
  let cardElement = null;
  let currentAudio = null;

  // 1. 初始化并监听设置变更
  function initSettings() {
    try {
      if (chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get(
          { enableFloating: true, buttonPosition: "bottom", clickAction: "popup" },
          (items) => {
            if (chrome.runtime.lastError) return;
            isFloatingEnabled = items.enableFloating !== false;
            buttonPosition = items.buttonPosition || "bottom";
            clickAction = items.clickAction || "popup";
          }
        );

        chrome.storage.onChanged.addListener((changes, area) => {
          if (area === "sync") {
            if (changes.enableFloating) {
              isFloatingEnabled = changes.enableFloating.newValue !== false;
              if (!isFloatingEnabled) hideAll();
            }
            if (changes.buttonPosition) {
              buttonPosition = changes.buttonPosition.newValue || "bottom";
            }
            if (changes.clickAction) {
              clickAction = changes.clickAction.newValue || "popup";
            }
          }
        });
      }
    } catch (e) {
      // 捕获异常
    }
  }

  // 2. 初始化 Shadow DOM 容器
  function ensureShadowDOM() {
    if (hostElement && shadowRoot) {
      if (!hostElement.parentNode) {
        (document.body || document.documentElement).appendChild(hostElement);
      }
      return;
    }

    hostElement = document.createElement("div");
    hostElement.id = "youdao-dict-extension-host";
    hostElement.style.cssText = "all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647; pointer-events: none;";

    shadowRoot = hostElement.attachShadow({ mode: "open" });

    shadowRoot.innerHTML = `
      <style>
        :host {
          all: initial;
        }
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        /* 浮动查词小按钮 */
        .yd-floating-btn {
          all: initial;
          box-sizing: border-box;
          position: fixed;
          display: none;
          align-items: center;
          gap: 5px;
          height: 28px;
          padding: 0 10px;
          background: #ffffff;
          color: #e53935;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
          font-size: 13px;
          font-weight: 600;
          line-height: 1;
          border-radius: 14px;
          border: 1px solid #ffcdd2;
          box-shadow: 0 4px 14px rgba(229, 57, 53, 0.2), 0 2px 4px rgba(0, 0, 0, 0.08);
          cursor: pointer;
          pointer-events: auto;
          user-select: none;
          transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.15s ease, background-color 0.15s ease;
          opacity: 0;
          transform: translateY(4px) scale(0.96);
        }
        .yd-floating-btn.visible {
          display: inline-flex;
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        .yd-floating-btn:hover {
          background-color: #e53935;
          color: #ffffff;
          border-color: #e53935;
          box-shadow: 0 6px 16px rgba(229, 57, 53, 0.35);
          transform: translateY(-1px) scale(1.02);
        }
        .yd-floating-btn:active {
          transform: translateY(0) scale(0.98);
        }
        .yd-icon {
          width: 14px;
          height: 14px;
          flex-shrink: 0;
          fill: currentColor;
        }

        /* 释义浮窗卡片 */
        .yd-card {
          position: fixed;
          display: none;
          width: 320px;
          max-width: 90vw;
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 12px 36px rgba(0, 0, 0, 0.16), 0 2px 8px rgba(0, 0, 0, 0.06);
          border: 1px solid #e2e8f0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
          pointer-events: auto;
          user-select: text;
          z-index: 2147483647;
          overflow: hidden;
          opacity: 0;
          transform: scale(0.96) translateY(4px);
          transition: opacity 0.15s ease, transform 0.15s ease;
        }
        .yd-card.visible {
          display: flex;
          flex-direction: column;
          opacity: 1;
          transform: scale(1) translateY(0);
        }

        /* 卡片头部 */
        .yd-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          cursor: grab;
        }
        .yd-card-header:active {
          cursor: grabbing;
        }
        .yd-card-title-group {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          max-width: 250px;
        }
        .yd-card-word {
          font-size: 15.5px;
          font-weight: 700;
          color: #0f172a;
          word-break: break-all;
          letter-spacing: -0.2px;
        }
        .yd-card-cet-tag {
          display: none;
          align-items: center;
          font-size: 10px;
          font-weight: 700;
          line-height: 1;
          padding: 2px 6px;
          border-radius: 4px;
          letter-spacing: 0.5px;
          user-select: none;
        }
        .yd-card-cet-tag.cet4 {
          display: inline-flex;
          background-color: #e0f2fe;
          color: #0369a1;
          border: 1px solid #bae6fd;
        }
        .yd-card-cet-tag.cet6 {
          display: inline-flex;
          background-color: #f3e8ff;
          color: #7e22ce;
          border: 1px solid #e9d5ff;
        }
        .yd-card-phonetic {
          font-size: 12px;
          color: #e11d48;
          background: #ffe4e6;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: Arial, -apple-system, sans-serif;
          font-weight: 500;
        }
        .yd-card-audio-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: #e53935;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 2px;
          border-radius: 4px;
          transition: background 0.15s;
        }
        .yd-card-audio-btn:hover {
          background: #fee2e2;
        }
        .yd-card-close-btn {
          background: none;
          border: none;
          font-size: 15px;
          line-height: 1;
          color: #94a3b8;
          cursor: pointer;
          padding: 4px 6px;
          border-radius: 4px;
          transition: all 0.15s ease;
        }
        .yd-card-close-btn:hover {
          color: #0f172a;
          background: #e2e8f0;
        }

        /* 卡片内容区 */
        .yd-card-body {
          padding: 12px 14px;
          max-height: 240px;
          overflow-y: auto;
          font-size: 13px;
          line-height: 1.6;
          color: #334155;
        }
        .yd-card-loading {
          color: #64748b;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          padding: 6px 0;
        }
        .yd-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid #4f46e5;
          border-top-color: transparent;
          border-radius: 50%;
          animation: yd-spin 0.8s linear infinite;
        }
        @keyframes yd-spin {
          to { transform: rotate(360deg); }
        }
        .yd-explain-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .yd-explain-item {
          padding-left: 2px;
        }
        .yd-explain-pos {
          color: #4f46e5;
          font-weight: 700;
          margin-right: 4px;
        }
        .yd-error-msg {
          color: #ef4444;
          font-size: 12px;
        }
        .yd-sentence-container {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .yd-sentence-trans {
          font-size: 13.5px;
          line-height: 1.6;
          color: #0f172a;
          background: #f8fafc;
          border-left: 3px solid #4f46e5;
          padding: 8px 10px;
          border-radius: 0 6px 6px 0;
          word-break: break-word;
        }

        /* 卡片底部 */
        .yd-card-footer {
          padding: 8px 14px;
          background: #f8fafc;
          border-top: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .yd-card-note-btn {
          background: #eef2ff;
          border: 1px solid #c7d2fe;
          color: #4338ca;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          box-shadow: 0 1px 2px rgba(79, 70, 229, 0.1);
          transition: all 0.15s ease;
        }
        .yd-card-note-btn:hover {
          background: #4338ca;
          color: #ffffff;
          border-color: #4338ca;
          box-shadow: 0 2px 6px rgba(79, 70, 229, 0.25);
        }
        .yd-card-note-btn.saved {
          background: #ecfdf5;
          color: #047857;
          border-color: #a7f3d0;
          cursor: default;
          box-shadow: none;
        }
        .yd-more-link {
          font-size: 11px;
          color: #4338ca;
          text-decoration: none;
          cursor: pointer;
          font-weight: 600;
          transition: color 0.15s ease;
        }
        .yd-more-link:hover {
          color: #312e81;
          text-decoration: underline;
        }

        /* 适配宿主/系统暗黑模式 */
        @media (prefers-color-scheme: dark) {
          .yd-card {
            background: #18181b;
            border-color: #27272a;
            box-shadow: 0 12px 36px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2);
          }
          .yd-card-header {
            background: #202024;
            border-bottom-color: #27272a;
          }
          .yd-card-word {
            color: #f4f4f5;
          }
          .yd-card-close-btn {
            color: #71717a;
          }
          .yd-card-close-btn:hover {
            color: #f4f4f5;
            background: #27272a;
          }
          .yd-card-body {
            color: #d4d4d8;
          }
          .yd-sentence-trans {
            background: #202024;
            color: #f4f4f5;
            border-left-color: #6366f1;
          }
          .yd-card-footer {
            background: #202024;
            border-top-color: #27272a;
          }
          .yd-more-link {
            color: #818cf8;
          }
          .yd-more-link:hover {
            color: #a5b4fc;
          }
        }
      </style>

      <!-- 悬浮小图标 -->
      <button type="button" class="yd-floating-btn" id="yd-btn" title="在有道词典中查看">
        <svg class="yd-icon" viewBox="0 0 24 24">
          <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12zm-3-7h-2V7h-2v2h-2v2h2v2h2v-2h2z"/>
        </svg>
        <span>有道</span>
      </button>

      <!-- 释义浮窗卡片 -->
      <div class="yd-card" id="yd-card">
        <div class="yd-card-header" id="yd-card-header">
          <div class="yd-card-title-group">
            <span class="yd-card-word" id="yd-card-word"></span>
            <span class="yd-card-cet-tag" id="yd-card-cet-tag" style="display:none;"></span>
            <span class="yd-card-phonetic" id="yd-card-phonetic" style="display:none;"></span>
            <button type="button" class="yd-card-audio-btn" id="yd-card-audio-btn" style="display:none;" title="播放发音">
              <svg class="yd-icon" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
            </button>
          </div>
          <button type="button" class="yd-card-close-btn" id="yd-card-close-btn" title="关闭 (Esc)">✕</button>
        </div>
        <div class="yd-card-body" id="yd-card-body"></div>
        <div class="yd-card-footer">
          <button type="button" class="yd-card-note-btn" id="yd-card-note-btn" title="存入生词与语句笔记本">📑 存入笔记</button>
          <a class="yd-more-link" id="yd-card-more-link" target="_blank">在有道词典中查看更多 ↗</a>
        </div>
      </div>
    `;

    floatingBtn = shadowRoot.getElementById("yd-btn");
    cardElement = shadowRoot.getElementById("yd-card");

    // 绑定按钮事件：在 mousedown 时阻止冒泡，防止网页选区被清除
    floatingBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    floatingBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleButtonClick();
    });

    // 绑定卡片关闭按钮
    const closeBtn = shadowRoot.getElementById("yd-card-close-btn");
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideCard();
    });

    // 卡片内部点击不触发向外关闭
    cardElement.addEventListener("mousedown", (e) => {
      e.stopPropagation();
    });

    // 卡片头部拖拽移动功能
    setupCardDrag();

    document.documentElement.appendChild(hostElement);
  }

  // 3. 点击悬浮按钮时的响应
  function handleButtonClick() {
    if (!selectedWord) return;

    if (clickAction === "tab") {
      // 模式 A：打开新网页
      chrome.runtime.sendMessage({
        action: "searchWord",
        word: selectedWord
      });
      hideButton();
    } else {
      // 模式 B（默认）：就地显示有道释义浮窗
      showCardForWord(selectedWord);
      hideButton();
    }
  }

  // 4. 显示浮窗并向后台获取释义
  function showCardForWord(word, customPoint = null) {
    ensureShadowDOM();
    if (!cardElement) return;

    const wordEl = shadowRoot.getElementById("yd-card-word");
    const cetTagEl = shadowRoot.getElementById("yd-card-cet-tag");
    const phoneticEl = shadowRoot.getElementById("yd-card-phonetic");
    const audioBtn = shadowRoot.getElementById("yd-card-audio-btn");
    const bodyEl = shadowRoot.getElementById("yd-card-body");
    const moreLink = shadowRoot.getElementById("yd-card-more-link");
    const noteBtn = shadowRoot.getElementById("yd-card-note-btn");

    // 设置初始状态
    const displayWord = word.length > 32 ? word.slice(0, 30) + "..." : word;
    wordEl.textContent = displayWord;
    wordEl.title = word;
    if (cetTagEl) {
      cetTagEl.style.display = "none";
      cetTagEl.textContent = "";
      cetTagEl.className = "yd-card-cet-tag";
    }
    if (noteBtn) {
      noteBtn.textContent = "📑 存入笔记";
      noteBtn.classList.remove("saved");
      noteBtn.onclick = null;
    }
    phoneticEl.style.display = "none";
    phoneticEl.style.backgroundColor = "";
    phoneticEl.style.color = "";
    phoneticEl.style.fontWeight = "";
    phoneticEl.style.fontSize = "";
    audioBtn.style.display = "none";
    moreLink.href = `https://dict.youdao.com/w/${encodeURIComponent(word)}`;
    bodyEl.innerHTML = `
      <div class="yd-card-loading">
        <div class="yd-spinner"></div>
        <span>正在查询有道${word.length > 30 ? "翻译" : "词典"}...</span>
      </div>
    `;

    // 定位卡片：根据传入坐标、浮标位置或居中定位显示
    positionCard(customPoint);
    cardElement.classList.add("visible");

    // 异步查询有道词典 API
    chrome.runtime.sendMessage({ action: "queryWord", word: word }, (response) => {
      if (!response || !response.success || !response.data) {
        bodyEl.innerHTML = `<div class="yd-error-msg">未找到网络释义，可点击下方链接前往有道查看。</div>`;
        return;
      }

      const data = response.data;

      // 渲染长句翻译或单词词典释义
      if (data.isSentence) {
        if (cetTagEl) cetTagEl.style.display = "none";
        phoneticEl.textContent = "有道翻译";
        phoneticEl.style.display = "inline-block";
        phoneticEl.style.backgroundColor = "#e53935";
        phoneticEl.style.color = "#ffffff";
        phoneticEl.style.fontWeight = "600";
        phoneticEl.style.fontSize = "11px";

        if (data.audioUrl) {
          audioBtn.style.display = "inline-flex";
          audioBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            playAudio(data.audioUrl);
          };
        }

        if (data.explains && data.explains.length > 0) {
          const transHtml = data.explains
            .map((exp) => `<div class="yd-sentence-trans">${escapeHtml(exp)}</div>`)
            .join("");
          bodyEl.innerHTML = `<div class="yd-sentence-container">${transHtml}</div>`;
        } else {
          bodyEl.innerHTML = `<div class="yd-error-msg">未找到翻译结果，可点击下方前往有道查看。</div>`;
        }
      } else {
        // 渲染四六级标签 (仅在为 CET4 或 CET6 时显示，非四六级则不显示任何徽标)
        if (cetTagEl) {
          if (data.cetTag === "CET4" || data.cetTag === "CET6") {
            cetTagEl.textContent = data.cetTag;
            cetTagEl.className = `yd-card-cet-tag ${data.cetTag.toLowerCase()}`;
            cetTagEl.style.display = "inline-flex";
          } else {
            cetTagEl.style.display = "none";
          }
        }

        // 渲染音标与发音
        if (data.phonetic) {
          phoneticEl.textContent = data.phonetic;
          phoneticEl.style.display = "inline-block";
        }

        if (data.audioUrl) {
          audioBtn.style.display = "inline-flex";
          audioBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            playAudio(data.audioUrl);
          };
        }

        // 渲染释义列表
        if (data.explains && data.explains.length > 0) {
          const listHtml = data.explains
            .map((exp) => `<li class="yd-explain-item">${escapeHtml(exp)}</li>`)
            .join("");
          bodyEl.innerHTML = `<ul class="yd-explain-list">${listHtml}</ul>`;
        } else {
          bodyEl.innerHTML = `<div class="yd-error-msg">暂无词条简析，可点击下方在有道网页中查询完整例句。</div>`;
        }
      }

      // 绑定存入笔记事件
      if (noteBtn) {
        noteBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          saveNoteFromCard(data);
        };
      }

      // 释义内容渲染撑开后，再次检测并自适应修正底部贴边，防止卡片底部被屏幕截断
      repositionCardIfOverflow();
    });
  }

  // 存入生词与语句笔记本
  function saveNoteFromCard(data) {
    const noteBtn = shadowRoot.getElementById("yd-card-note-btn");
    const item = {
      id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      word: data.word || selectedWord || "",
      phonetic: data.phonetic || "",
      cetTag: data.cetTag || "",
      explains: Array.isArray(data.explains) ? data.explains.join("\n") : (data.explains || ""),
      source: document.title || "网页划词",
      url: window.location.href,
      createdAt: Date.now()
    };

    try {
      chrome.storage.local.get({ youdao_global_notebook: [] }, (res) => {
        const list = res.youdao_global_notebook || [];
        const filtered = list.filter((n) => (n.word || "").toLowerCase() !== item.word.toLowerCase());
        filtered.unshift(item);
        chrome.storage.local.set({ youdao_global_notebook: filtered }, () => {
          if (noteBtn) {
            noteBtn.textContent = "✓ 已存入";
            noteBtn.classList.add("saved");
          }
        });
      });
    } catch (e) {
      console.warn("Save note failed:", e);
    }
  }

  // 播放发音（增加 Promise 异常捕获，防止快速切换连击报错）
  function playAudio(url) {
    try {
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = "";
      }
      currentAudio = new Audio(url);
      const playPromise = currentAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // 优雅忽略由 pause() 或音频快速切换引起的 AbortError
        });
      }
    } catch (e) {
      console.warn("Audio play failed:", e);
    }
  }

  // 定位浮窗卡片
  function positionCard(pos = null) {
    if (!cardElement) return;

    const cardWidth = 310;
    // 使用当前实际高度或预留展开高度（约240px），确保多释义展开时不冲出视口
    const cardHeight = Math.max(cardElement.offsetHeight || 0, 240);
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

    let left = 20;
    let top = 20;

    if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
      left = pos.x;
      top = pos.y;
    } else if (pos && typeof pos.left === "number" && typeof pos.top === "number") {
      left = pos.left;
      top = pos.top;
    } else if (floatingBtn && floatingBtn.style.left && floatingBtn.style.top) {
      left = parseFloat(floatingBtn.style.left) || 20;
      top = parseFloat(floatingBtn.style.top) || 20;
    } else {
      left = (viewportWidth - cardWidth) / 2;
      top = Math.max(20, (viewportHeight - cardHeight) / 3);
    }

    // 避免右侧溢出
    if (left + cardWidth > viewportWidth - 16) {
      left = viewportWidth - cardWidth - 16;
    }
    left = Math.max(16, left);

    // 避免下方溢出
    if (top + cardHeight > viewportHeight - 16) {
      top = Math.max(16, viewportHeight - cardHeight - 16);
    }
    top = Math.max(16, top);

    cardElement.style.left = `${left}px`;
    cardElement.style.top = `${top}px`;
  }

  // 内容动态展开后的底部溢出修正
  function repositionCardIfOverflow() {
    if (!cardElement || !cardElement.classList.contains("visible")) return;
    requestAnimationFrame(() => {
      const rect = cardElement.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      if (rect.bottom > viewportHeight - 12) {
        const adjustedTop = Math.max(12, viewportHeight - rect.height - 12);
        cardElement.style.top = `${adjustedTop}px`;
      }
    });
  }

  // 头部拖拽实现
  function setupCardDrag() {
    const header = shadowRoot.getElementById("yd-card-header");
    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;

    header.addEventListener("mousedown", (e) => {
      if (e.target.closest("button") || e.target.closest("a")) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initialLeft = parseFloat(cardElement.style.left) || 0;
      initialTop = parseFloat(cardElement.style.top) || 0;
      e.preventDefault();
    });

    // 拖拽移动与松开绑定在 document 级别，并添加鼠标离开窗口安全兜底，防止"粘住"
    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const cardW = cardElement.offsetWidth || 320;
      const cardH = cardElement.offsetHeight || 200;
      const maxLeft = Math.max(10, viewportWidth - cardW - 10);
      const maxTop = Math.max(10, viewportHeight - cardH - 10);
      const newLeft = Math.max(10, Math.min(maxLeft, initialLeft + dx));
      const newTop = Math.max(10, Math.min(maxTop, initialTop + dy));
      cardElement.style.left = `${newLeft}px`;
      cardElement.style.top = `${newTop}px`;
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
    });

    // 安全兜底：鼠标完全移出视口时强制释放拖拽
    window.addEventListener("mouseleave", () => {
      isDragging = false;
    });
  }

  // 5. 显示浮标小按钮并智能定位
  function showButtonAt(rect) {
    ensureShadowDOM();
    if (!floatingBtn) return;

    // 如果卡片正在显示，不打断用户阅读
    if (cardElement && cardElement.classList.contains("visible")) {
      return;
    }

    const btnWidth = 75;
    const btnHeight = 28;
    const gap = 8;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

    let top = 0;
    let left = 0;

    if (buttonPosition === "bottom") {
      // 默认推荐：选区正下方（与 Edge 顶部的微型菜单完全错开，永不遮挡）
      top = rect.bottom + gap;
      if (top + btnHeight > viewportHeight - 8) {
        top = Math.max(8, rect.top - btnHeight - gap);
      }
      left = rect.right - btnWidth / 2;
    } else if (buttonPosition === "right") {
      top = rect.top + (rect.height - btnHeight) / 2;
      left = rect.right + gap;
      if (left + btnWidth > viewportWidth - 8) {
        left = rect.right - btnWidth;
        top = rect.bottom + gap;
      }
    } else {
      top = rect.top - btnHeight - gap;
      if (top < 8) {
        top = rect.bottom + gap;
      }
      left = rect.right - btnWidth / 2;
    }

    const minLeft = 10;
    const maxLeft = viewportWidth - btnWidth - 10;
    left = Math.max(minLeft, Math.min(left, maxLeft));

    floatingBtn.style.left = `${left}px`;
    floatingBtn.style.top = `${top}px`;
    floatingBtn.classList.add("visible");
  }

  function hideButton() {
    if (floatingBtn) floatingBtn.classList.remove("visible");
  }

  function hideCard() {
    if (cardElement) cardElement.classList.remove("visible");
  }

  function hideAll() {
    hideButton();
    hideCard();
  }

  function escapeHtml(str) {
    return (str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // 6. 处理文本划选
  function handleSelection() {
    // 若在阅读器的非光标模式（手绘/荧光笔/方框/橡皮擦/文本批注），严禁弹出浮标或卡片
    if (
      document.body &&
      (document.body.classList.contains("mode-pen") ||
       document.body.classList.contains("mode-highlighter") ||
       document.body.classList.contains("mode-rect") ||
       document.body.classList.contains("mode-eraser") ||
       document.body.classList.contains("mode-text") ||
       (document.body.className && (
         document.body.className.includes("mode-pen") ||
         document.body.className.includes("mode-highlighter") ||
         document.body.className.includes("mode-rect") ||
         document.body.className.includes("mode-eraser") ||
         document.body.className.includes("mode-text")
       )))
    ) {
      hideButton();
      hideCard();
      return;
    }

    if (!isFloatingEnabled) {
      hideButton();
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      hideButton();
      return;
    }

    const text = selection.toString().trim();
    if (!text || text.length > 800) {
      hideButton();
      return;
    }

    // 智能剔除双击或划选时可能附带的首尾标点符号（覆盖中英文所有标点、书名号、括号、行尾连字符）
    const cleanText = text
      .replace(/^[“"‘'(\[{<«《（【〔〈『「“\s—–-]+|[”"’')\]}>».,:;!?。，！？；：、…—–》）】〕〉』」”\s-]+$/g, "")
      .replace(/(\w+)-\s*\r?\n\s*(\w+)/g, "$1$2") // 自动缝合 PDF 跨行断词 (如 pre-\n dators -> predators)
      .replace(/\r?\n\s*/g, " ")
      .trim();

    selectedWord = cleanText || text;

    try {
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect && (rect.width > 0 || rect.height > 0)) {
          showButtonAt(rect);
          return;
        }
      }
    } catch (err) {
      // 容错保护
    }

    hideButton();
  }

  // 7. 事件监听（采用单点捕获模式 capture: true，防止被复杂网页的 stopPropagation 阻断）
  initSettings();

  // 对外暴露主动检测选区接口、隐藏浮层接口及直接呼出词典释义卡片接口（供阅读器等场景调用）
  window.__youdaoCheckSelection = handleSelection;
  window.__youdaoHideAll = hideAll;
  window.__youdaoShowWordCard = function (word, pos = null) {
    if (!word || typeof word !== "string") return;
    const cleanWord = word.trim();
    if (!cleanWord) return;
    selectedWord = cleanWord;
    showCardForWord(cleanWord, pos);
  };

  function onUserSelect() {
    setTimeout(handleSelection, 20);
  }

  // 顶层捕获阶段监听鼠标双击（专为阅读器与网页双击词语选词弹出浮标优化，避免重复多倍触发）
  document.addEventListener("dblclick", (e) => {
    if (hostElement && e.composedPath && e.composedPath().includes(hostElement)) {
      return;
    }
    setTimeout(handleSelection, 20);
    setTimeout(handleSelection, 80);
  }, true);

  // 顶层捕获阶段监听鼠标抬起
  document.addEventListener("mouseup", (e) => {
    if (hostElement && e.composedPath && e.composedPath().includes(hostElement)) {
      return;
    }
    onUserSelect();
  }, true);

  // 备用监听：选区变化监听（防部分网页框架吞掉 mouseup，增加 150ms 防抖避免拖拽高频消耗）
  let selectionTimeout = null;
  document.addEventListener("selectionchange", () => {
    if (!floatingBtn || !floatingBtn.classList.contains("visible")) {
      clearTimeout(selectionTimeout);
      selectionTimeout = setTimeout(handleSelection, 150);
    }
  });

  // 页面点击空白处隐藏浮标
  document.addEventListener("mousedown", (e) => {
    if (hostElement && e.composedPath && e.composedPath().includes(hostElement)) {
      return;
    }
    hideButton();
    hideCard();
  }, true);

  // 页面滚动时隐藏浮标，但保留卡片（方便用户查看长文本）
  window.addEventListener("scroll", hideButton, { passive: true });

  // 按 Esc 键关闭
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideAll();
    }
  }, true);
})();
