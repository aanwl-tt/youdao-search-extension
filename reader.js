/**
 * 有道 PDF 沉浸式阅读器 - 业务逻辑 (Edge 原生修改工具增强版)
 * 包含：4K 渲染、像素级文本对齐、空白选词防崩溃、Edge 原生级修改工具条
 * (光标模式/荧光高亮笔/手写绘制/橡皮擦/添加文字批注/保存导出已标注文档)、IndexedDB 本地历史与秒开书架
 */

// 配置 PDF.js 本地 Worker
pdfjsLib.GlobalWorkerOptions.workerSrc = "lib/pdfjs/pdf.worker.min.js";

// 全局运行时状态
let currentPdfDoc = null;
let currentScale = 1.3;
let totalPages = 0;
let pageWrappers = [];
let renderGenerationId = 0; // 渲染批次序号，防止快速缩放时的并发渲染冲突
let currentDocKey = "";     // 文档唯一标示: `${fileName}_${fileSize}`
let currentDocId = "";      // IndexedDB 主键 ID
let currentDocBuffer = null;// 当前文档 ArrayBuffer
let currentDocName = "";    // 当前文档原始文件名
let currentAnnotations = [];// 当前文档的所有标注 (手写笔迹、方框、文本笔记)

// 工具模式状态 (Edge 原生风格)
let currentTool = "cursor"; // "cursor" | "pen" | "rect" | "eraser" | "text"
let currentPenColor = "#004de6";
let currentPenWidth = 2.0;
let currentRectColor = "#e61b1b";
let currentRectWidth = 2.0;
let currentEraserMode = "stroke"; // "stroke" (整笔擦除) | "area" (区域擦除)

// 标注撤销/重做栈
let undoStack = [];
let redoStack = [];

// 全文搜索状态
let searchMatches = [];
let currentSearchIndex = -1;
let docSearchMatches = [];
let currentDocSearchIndex = -1;
let docPageTextCache = new Map();
let searchSessionId = 0;

// 全局生词与语句笔记本
let globalNotebook = [];

// DOM 元素引用
const fileInput = document.getElementById("file-input");
const btnOpenEmpty = document.getElementById("btn-open-empty");
const dropZone = document.getElementById("drop-zone");
const emptyState = document.getElementById("empty-state");
const pdfContainer = document.getElementById("pdf-container");
const docTitle = document.getElementById("doc-title");
const pageCountSpan = document.getElementById("page-count");
const pageNumInput = document.getElementById("page-num-input");
const btnPrev = document.getElementById("btn-prev");
const btnNext = document.getElementById("btn-next");
const btnZoomIn = document.getElementById("btn-zoom-in");
const btnZoomOut = document.getElementById("btn-zoom-out");
const btnZoomFit = document.getElementById("btn-zoom-fit");
const btnTextEnhance = document.getElementById("btn-text-enhance");
const zoomText = document.getElementById("zoom-text");
const workspace = document.getElementById("workspace");

// 顶部搜索与回退控制
const btnSearchToggle = document.getElementById("btn-search-toggle");
const searchBar = document.getElementById("search-bar");
const searchInput = document.getElementById("search-input");
const searchCount = document.getElementById("search-count");
const btnSearchPrev = document.getElementById("btn-search-prev");
const btnSearchNext = document.getElementById("btn-search-next");
const btnSearchClose = document.getElementById("btn-search-close");
const btnUndo = document.getElementById("btn-undo");
const btnRedo = document.getElementById("btn-redo");

// 顶部工具栏 Edge 批注工具
const toolCursor = document.getElementById("tool-cursor");
const toolAddNote = document.getElementById("tool-add-note");

const toolPen = document.getElementById("tool-pen");
const penMenu = document.getElementById("pen-menu");
const penPaletteGrid = document.getElementById("pen-palette-grid");
const penWavyPreview = document.getElementById("pen-wavy-preview");
const penSizeSlider = document.getElementById("pen-size-slider");
const penSizeLabel = document.getElementById("pen-size-label");

const toolRect = document.getElementById("tool-rect");
const rectMenu = document.getElementById("rect-menu");
const rectPaletteGrid = document.getElementById("rect-palette-grid");
const rectWavyPreview = document.getElementById("rect-wavy-preview");
const rectSizeSlider = document.getElementById("rect-size-slider");
const rectSizeLabel = document.getElementById("rect-size-label");

const toolEraser = document.getElementById("tool-eraser");
const eraserMenu = document.getElementById("eraser-menu");
const btnEraserModeStroke = document.getElementById("btn-eraser-mode-stroke");
const btnEraserModeArea = document.getElementById("btn-eraser-mode-area");
const btnEraserClearPage = document.getElementById("btn-eraser-clear-page");

const toolText = document.getElementById("tool-text");
const btnSavePdf = document.getElementById("btn-save-pdf");

// 最近文档书架与下拉
const btnRecentToggle = document.getElementById("btn-recent-toggle");
const recentDropdownMenu = document.getElementById("recent-dropdown-menu");
const recentMenuList = document.getElementById("recent-menu-list");
const recentShelf = document.getElementById("recent-shelf");
const recentCardsGrid = document.getElementById("recent-cards-grid");

// 标注抽屉与快速划词弹出条
const btnAnnotationsToggle = document.getElementById("btn-annotations-toggle");
const annotationsCountSpan = document.getElementById("annotations-count");
const annotationsDrawer = document.getElementById("annotations-drawer");
const drawerCloseBtn = document.getElementById("drawer-close-btn");
const drawerList = document.getElementById("drawer-list");
const drawerCountSpan = document.getElementById("drawer-count");
const highlightPopup = document.getElementById("highlight-popup");

// 全局生词与语句笔记本抽屉
const btnNotebookToggle = document.getElementById("btn-notebook-toggle");
const notebookDrawer = document.getElementById("notebook-drawer");
const notebookCloseBtn = document.getElementById("notebook-close-btn");
const notebookCount = document.getElementById("notebook-count");
const notebookDrawerCount = document.getElementById("notebook-drawer-count");
const notebookList = document.getElementById("notebook-list");
const notebookSearchInput = document.getElementById("notebook-search-input");
const btnExportNotesMd = document.getElementById("btn-export-notes-md");
const btnExportNotesAnki = document.getElementById("btn-export-notes-anki");
const btnClearNotes = document.getElementById("btn-clear-notes");

// 目录大纲抽屉 (TOC)
const btnOutlineToggle = document.getElementById("btn-outline-toggle");
const outlineCount = document.getElementById("outline-count");
const outlineDrawer = document.getElementById("outline-drawer");
const outlineCloseBtn = document.getElementById("outline-close-btn");
const drawerOutlineCount = document.getElementById("drawer-outline-count");
const outlineList = document.getElementById("outline-list");

// 阅读主题切换 (浅色 / 羊皮纸护眼 / 夜间暗黑)
const btnThemeToggle = document.getElementById("btn-theme-toggle");
const themeIcon = document.getElementById("theme-icon");
const themeLabel = document.getElementById("theme-label");
const themeMenu = document.getElementById("theme-menu");
const btnThemeLight = document.getElementById("btn-theme-light");
const btnThemeSepia = document.getElementById("btn-theme-sepia");
const btnThemeDark = document.getElementById("btn-theme-dark");

// 高亮标注非阻塞操作气泡
const highlightActionPopup = document.getElementById("highlight-action-popup");
const hlActDict = document.getElementById("hl-act-dict");
const hlActCopy = document.getElementById("hl-act-copy");
const hlActDelete = document.getElementById("hl-act-delete");
let currentActionAnnotation = null;

// 视口懒加载配置：以当前视口所在页为基准，默认前后各预载 3 页 (缓冲区 3500px)
const PRELOAD_BUFFER_PX = 3500;
let pageObserver = null;
let pageViewportMap = new Map();
let currentTheme = "light";

// =========================================================================
// 1. IndexedDB 本地持久化引擎 (管理本地 PDF 历史与划词高亮标注)
// =========================================================================
const DB_NAME = "YoudaoReaderDB";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("recent_docs")) {
        db.createObjectStore("recent_docs", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("annotations")) {
        const annStore = db.createObjectStore("annotations", { keyPath: "id" });
        annStore.createIndex("pdfKey", "pdfKey", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// 保存/更新最近打开的文档
async function dbSaveRecentDoc(meta, arrayBuffer) {
  try {
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      console.warn("dbSaveRecentDoc: buffer is empty or detached, skipping save.");
      return;
    }
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction("recent_docs", "readwrite");
      const store = tx.objectStore("recent_docs");
      const record = {
        id: meta.id,
        pdfKey: meta.pdfKey || `${meta.name}_${meta.size || arrayBuffer.byteLength}`,
        name: meta.name,
        size: meta.size || arrayBuffer.byteLength,
        totalPages: meta.totalPages || 0,
        lastPage: meta.lastPage || 1,
        lastOpened: Date.now(),
        data: arrayBuffer.slice(0) // 确保深拷贝，绝不传递被剥离的 ArrayBuffer
      };
      store.put(record);

      tx.oncomplete = async () => {
        try {
          await dbPruneRecentDocs(10);
        } catch (e) {}
        refreshRecentUI();
        resolve();
      };
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch (err) {
    console.warn("dbSaveRecentDoc failed:", err);
  }
}

// 获取所有最近文档元数据（流式游标遍历，杜绝全量把二进制大文件加载至内存）
async function dbGetRecentDocs() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction("recent_docs", "readonly");
      const store = tx.objectStore("recent_docs");
      const list = [];
      const req = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const item = cursor.value;
          list.push({
            id: item.id,
            pdfKey: item.pdfKey,
            name: item.name,
            size: item.size,
            totalPages: item.totalPages,
            lastPage: item.lastPage,
            lastOpened: item.lastOpened
          });
          cursor.continue();
        } else {
          list.sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0));
          resolve(list);
        }
      };
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    return [];
  }
}

// 获取指定文档的二进制数据
async function dbGetDocData(id) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction("recent_docs", "readonly");
      const store = tx.objectStore("recent_docs");
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
}

// 删除指定文档（级联清理对应孤儿批注）
async function dbDeleteRecentDoc(id) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(["recent_docs", "annotations"], "readwrite");
      const docStore = tx.objectStore("recent_docs");
      const annStore = tx.objectStore("annotations");
      const annIdx = annStore.index("pdfKey");

      const getReq = docStore.get(id);
      getReq.onsuccess = () => {
        const doc = getReq.result;
        const targetPdfKey = (doc && (doc.pdfKey || (doc.name && doc.size ? `${doc.name}_${doc.size}` : null))) || id;

        docStore.delete(id);

        const deleteAnns = (key) => {
          if (!key) return;
          const annReq = annIdx.getAllKeys(key);
          annReq.onsuccess = () => {
            (annReq.result || []).forEach((annId) => annStore.delete(annId));
          };
        };

        deleteAnns(targetPdfKey);
        if (targetPdfKey !== id) {
          deleteAnns(id);
        }
      };

      tx.oncomplete = () => {
        refreshRecentUI();
        resolve();
      };
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch (err) {
    console.warn("dbDeleteRecentDoc failed:", err);
  }
}

// 更新文档当前阅读进度
async function dbUpdateDocProgress(id, pageNum) {
  if (!id) return;
  try {
    const db = await openDB();
    const tx = db.transaction("recent_docs", "readwrite");
    const store = tx.objectStore("recent_docs");
    const req = store.get(id);
    req.onsuccess = () => {
      const doc = req.result;
      if (doc) {
        doc.lastPage = pageNum;
        doc.lastOpened = Date.now();
        store.put(doc);
      }
    };
  } catch (e) {}
}

// 超过限制时清理最旧文档并级联清理孤儿批注
async function dbPruneRecentDocs(maxCount) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(["recent_docs", "annotations"], "readwrite");
      const store = tx.objectStore("recent_docs");
      const annStore = tx.objectStore("annotations");
      const annIdx = annStore.index("pdfKey");
      const req = store.getAll();
      req.onsuccess = () => {
        const docs = req.result || [];
        if (docs.length > maxCount) {
          docs.sort((a, b) => (a.lastOpened || 0) - (b.lastOpened || 0));
          const toDelete = docs.slice(0, docs.length - maxCount);
          toDelete.forEach((d) => {
            store.delete(d.id);
            const targetPdfKey = d.pdfKey || (d.name && d.size ? `${d.name}_${d.size}` : null) || d.id;
            const deleteAnns = (key) => {
              if (!key) return;
              const annReq = annIdx.getAllKeys(key);
              annReq.onsuccess = () => {
                (annReq.result || []).forEach((annId) => annStore.delete(annId));
              };
            };
            deleteAnns(targetPdfKey);
            if (targetPdfKey !== d.id) {
              deleteAnns(d.id);
            }
          });
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch (e) {}
}

// 保存单条标注 (高亮 / 手写笔迹 / 文本笔记)
async function dbSaveAnnotation(ann) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction("annotations", "readwrite");
      tx.objectStore("annotations").put(ann);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch (err) {
    console.warn("dbSaveAnnotation failed:", err);
  }
}

// 读取文档的所有标注
async function dbGetAnnotations(pdfKey) {
  if (!pdfKey) return [];
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction("annotations", "readonly");
      const store = tx.objectStore("annotations");
      const idx = store.index("pdfKey");
      const req = idx.getAll(pdfKey);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    return [];
  }
}

// 删除指定标注
async function dbDeleteAnnotation(id) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction("annotations", "readwrite");
      tx.objectStore("annotations").delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch (err) {
    console.warn("dbDeleteAnnotation failed:", err);
  }
}

// =========================================================================
// 2. 最近阅读书架与下拉列表 UI 逻辑
// =========================================================================
function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return "";
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

// 刷新最近阅读 UI（书架与顶部菜单）
async function refreshRecentUI() {
  const docs = await dbGetRecentDocs();

  // 1. 刷新首页空状态书架
  if (docs.length > 0) {
    recentShelf.style.display = "block";
    recentCardsGrid.innerHTML = docs
      .map(
        (doc) => `
        <div class="recent-card" data-doc-id="${doc.id}">
          <div class="recent-card-left">
            <span class="recent-card-icon">📑</span>
            <div class="recent-card-info">
              <span class="recent-card-name" title="${escapeHtml(doc.name)}">${escapeHtml(doc.name)}</span>
              <span class="recent-card-progress">已读至第 ${doc.lastPage || 1} 页 / 共 ${doc.totalPages || 0} 页</span>
              <span class="recent-card-meta">${formatFileSize(doc.size)} · ${formatRelativeTime(doc.lastOpened)}</span>
            </div>
          </div>
          <button type="button" class="recent-card-delete" data-del-id="${doc.id}" title="删除此记录">✕</button>
        </div>
      `
      )
      .join("");

    recentCardsGrid.querySelectorAll(".recent-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest(".recent-card-delete")) return;
        const id = card.dataset.docId;
        openDocFromDatabase(id);
      });
    });

    recentCardsGrid.querySelectorAll(".recent-card-delete").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.delId;
        dbDeleteRecentDoc(id);
      });
    });
  } else {
    recentShelf.style.display = "none";
  }

  // 2. 刷新顶部“最近文档”下拉菜单
  if (docs.length > 0) {
    recentMenuList.innerHTML = docs
      .map(
        (doc) => `
        <div class="recent-menu-item" data-doc-id="${doc.id}">
          <div class="recent-item-info">
            <span class="recent-item-name" title="${escapeHtml(doc.name)}">${escapeHtml(doc.name)}</span>
            <span class="recent-item-meta">第 ${doc.lastPage || 1} 页 · ${formatRelativeTime(doc.lastOpened)}</span>
          </div>
          <button type="button" class="recent-item-delete" data-del-id="${doc.id}" title="删除记录">✕</button>
        </div>
      `
      )
      .join("");

    recentMenuList.querySelectorAll(".recent-menu-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        if (e.target.closest(".recent-item-delete")) return;
        const id = item.dataset.docId;
        recentDropdownMenu.style.display = "none";
        openDocFromDatabase(id);
      });
    });

    recentMenuList.querySelectorAll(".recent-item-delete").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.delId;
        dbDeleteRecentDoc(id);
      });
    });
  } else {
    recentMenuList.innerHTML = `<div class="recent-empty-hint">暂无最近阅读记录</div>`;
  }
}

// 从 IndexedDB 直接秒开 PDF
async function openDocFromDatabase(id) {
  const docs = await dbGetRecentDocs();
  const meta = docs.find((d) => d.id === id);
  if (!meta) return;

  const buffer = await dbGetDocData(id);
  if (!buffer || buffer.byteLength === 0) {
    alert("该缓存文件已被清理或已失效，请重新点击“打开本地 PDF”选择该文件。");
    dbDeleteRecentDoc(id);
    return;
  }

  loadPdfData(buffer, meta.name, id, meta.lastPage || 1);
}

// =========================================================================
// 3. Edge 原生修改工具条切换逻辑 (光标 / 手写绘制 / 方框 / 橡皮擦 / 文本)
// =========================================================================
const EDGE_30_COLORS = [
  "#000000", "#58595b", "#808285", "#a7a9ac", "#d1d3d4", "#ffffff",
  "#b31564", "#e61b1b", "#ff5500", "#ffaa00", "#ffce00", "#ffe600",
  "#a2e61b", "#26e600", "#008055", "#00aacc", "#004de6", "#3d00b8",
  "#6600cc", "#600080", "#f7d7c4", "#bb9167", "#8e562e", "#613d30",
  "#ff80ff", "#ffc680", "#ffff80", "#80ff9e", "#80d6ff", "#bcb3ff"
];

function setTool(toolName) {
  currentTool = toolName;
  // 保留已有的 text-enhanced 等类名，只切换 mode-* 类
  document.body.className = document.body.className.replace(/\bmode-\S+/g, "").trim();
  document.body.classList.add(`mode-${toolName}`);

  toolCursor.classList.toggle("active", toolName === "cursor");
  toolPen.classList.toggle("active", toolName === "pen");
  toolRect.classList.toggle("active", toolName === "rect");
  toolEraser.classList.toggle("active", toolName === "eraser");
  toolText.classList.toggle("active", toolName === "text");

  // 关闭所有弹出菜单
  penMenu.style.display = "none";
  rectMenu.style.display = "none";
  eraserMenu.style.display = "none";
  hideHighlightPopup();

  // 若切出光标模式，彻底清除所有文本选择区与有道浮窗
  if (toolName !== "cursor") {
    window.getSelection()?.removeAllRanges();
    if (window.__youdaoHideAll) {
      window.__youdaoHideAll();
    }
  }
}

function getHighlighterRgba(colorName) {
  switch (colorName) {
    case "green": return "rgba(0, 230, 118, 0.45)";
    case "blue": return "rgba(0, 176, 255, 0.45)";
    case "pink": return "rgba(255, 64, 129, 0.45)";
    case "orange": return "rgba(255, 145, 0, 0.45)";
    case "yellow":
    default: return "rgba(255, 214, 0, 0.45)";
  }
}

function showToast(msg) {
  let toast = document.querySelector(".reader-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "reader-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("visible");
  setTimeout(() => {
    toast.classList.remove("visible");
  }, 2200);
}

// -------------------------------------------------------------------------
// Edge 原生 30 色彩盘与滑动条初始化
// -------------------------------------------------------------------------
function initEdgePalettes() {
  if (penPaletteGrid) {
    penPaletteGrid.innerHTML = "";
    EDGE_30_COLORS.forEach((c) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "edge-color-circle" + (c.toLowerCase() === currentPenColor.toLowerCase() ? " active" : "");
      dot.style.backgroundColor = c;
      dot.dataset.color = c;
      dot.title = c;
      if (c.toLowerCase() === "#ffffff") {
        dot.style.border = "1px solid #777";
      }
      dot.addEventListener("click", (e) => {
        e.stopPropagation();
        penPaletteGrid.querySelectorAll(".edge-color-circle").forEach((d) => d.classList.remove("active"));
        dot.classList.add("active");
        currentPenColor = c;
        updatePenPreview();
      });
      penPaletteGrid.appendChild(dot);
    });
  }

  if (rectPaletteGrid) {
    rectPaletteGrid.innerHTML = "";
    EDGE_30_COLORS.forEach((c) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "edge-color-circle" + (c.toLowerCase() === currentRectColor.toLowerCase() ? " active" : "");
      dot.style.backgroundColor = c;
      dot.dataset.color = c;
      dot.title = c;
      if (c.toLowerCase() === "#ffffff") {
        dot.style.border = "1px solid #777";
      }
      dot.addEventListener("click", (e) => {
        e.stopPropagation();
        rectPaletteGrid.querySelectorAll(".edge-color-circle").forEach((d) => d.classList.remove("active"));
        dot.classList.add("active");
        currentRectColor = c;
        updateRectPreview();
      });
      rectPaletteGrid.appendChild(dot);
    });
  }

  if (penSizeSlider) {
    penSizeSlider.addEventListener("input", (e) => {
      currentPenWidth = parseFloat(e.target.value) || 2.0;
      if (penSizeLabel) penSizeLabel.textContent = `${currentPenWidth.toFixed(1)}px`;
      updatePenPreview();
    });
  }

  if (rectSizeSlider) {
    rectSizeSlider.addEventListener("input", (e) => {
      currentRectWidth = parseFloat(e.target.value) || 2.0;
      if (rectSizeLabel) rectSizeLabel.textContent = `${currentRectWidth.toFixed(1)}px`;
      updateRectPreview();
    });
  }

  updatePenPreview();
  updateRectPreview();
}

function updatePenPreview() {
  if (penWavyPreview) {
    penWavyPreview.setAttribute("stroke", currentPenColor);
    penWavyPreview.setAttribute("stroke-width", Math.min(10, Math.max(1.5, currentPenWidth)));
  }
}

function updateRectPreview() {
  if (rectWavyPreview) {
    rectWavyPreview.setAttribute("stroke", currentRectColor);
    rectWavyPreview.setAttribute("stroke-width", Math.min(8, Math.max(1.5, currentRectWidth)));
  }
}

// -------------------------------------------------------------------------
// 标注撤销 / 重做 (Undo / Redo) 引擎
// -------------------------------------------------------------------------
function recordUndoAction(action) {
  undoStack.push(action);
  redoStack = []; // 有新动作则清空重做栈
  updateUndoRedoUI();
}

function updateUndoRedoUI() {
  if (btnUndo) {
    btnUndo.disabled = undoStack.length === 0;
    btnUndo.style.opacity = undoStack.length === 0 ? "0.35" : "1";
    btnUndo.style.cursor = undoStack.length === 0 ? "not-allowed" : "pointer";
  }
  if (btnRedo) {
    btnRedo.disabled = redoStack.length === 0;
    btnRedo.style.opacity = redoStack.length === 0 ? "0.35" : "1";
    btnRedo.style.cursor = redoStack.length === 0 ? "not-allowed" : "pointer";
  }
}

async function performUndo() {
  if (!undoStack.length) {
    showToast("没有可撤销的修改");
    return;
  }
  const action = undoStack.pop();
  redoStack.push(action);

  if (action.type === "add") {
    // 撤销添加：从当前集合与数据库中移除
    currentAnnotations = currentAnnotations.filter((a) => a.id !== action.item.id);
    await dbDeleteAnnotation(action.item.id);
  } else if (action.type === "delete") {
    // 撤销删除：重新添加回集合与数据库
    currentAnnotations.push(action.item);
    await dbSaveAnnotation(action.item);
  } else if (action.type === "clear_page") {
    // 撤销整页清空：重新恢复一整页的标注
    for (const ann of action.items) {
      currentAnnotations.push(ann);
      await dbSaveAnnotation(ann);
    }
  }

  refreshAllAnnotationViews();
  updateUndoRedoUI();
  showToast("↺ 已撤销标注");
}

async function performRedo() {
  if (!redoStack.length) {
    showToast("没有可恢复的修改");
    return;
  }
  const action = redoStack.pop();
  undoStack.push(action);

  if (action.type === "add") {
    // 重做添加：重新放回集合与数据库
    currentAnnotations.push(action.item);
    await dbSaveAnnotation(action.item);
  } else if (action.type === "delete") {
    // 重做删除：再次删除
    currentAnnotations = currentAnnotations.filter((a) => a.id !== action.item.id);
    await dbDeleteAnnotation(action.item.id);
  } else if (action.type === "clear_page") {
    // 重做整页清空：再次清空
    const ids = new Set(action.items.map((a) => a.id));
    currentAnnotations = currentAnnotations.filter((a) => !ids.has(a.id));
    for (const ann of action.items) {
      await dbDeleteAnnotation(ann.id);
    }
  }

  refreshAllAnnotationViews();
  updateUndoRedoUI();
  showToast("↻ 已恢复标注");
}

function refreshAllAnnotationViews() {
  document.querySelectorAll(".pdf-page-wrapper").forEach((wrapper) => {
    const pageNum = parseInt(wrapper.dataset.pageNum, 10);
    const hlLayer = wrapper.querySelector(".highlight-layer");
    const drawCanvas = wrapper.querySelector(".draw-canvas");
    const textLayer = wrapper.querySelector(".text-annotation-layer");
    if (hlLayer) renderPageHighlights(pageNum, hlLayer);
    if (drawCanvas) renderPageDrawings(pageNum, drawCanvas);
    if (textLayer) renderPageTextBoxes(pageNum, textLayer);
  });
  updateAnnotationsUI();
}

// -------------------------------------------------------------------------
// PDF 全文搜索控制 (Ctrl + F)
// -------------------------------------------------------------------------
function toggleSearchBar(forceOpen = false) {
  if (!searchBar) return;
  const isHidden = searchBar.style.display === "none";
  if (forceOpen || isHidden) {
    searchBar.style.display = "flex";
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  } else {
    closeSearchBar();
  }
}

function closeSearchBar() {
  if (!searchBar) return;
  searchBar.style.display = "none";
  searchSessionId++;
  clearSearchHighlights();
  searchMatches = [];
  docSearchMatches = [];
  currentSearchIndex = -1;
  currentDocSearchIndex = -1;
  if (searchCount) {
    searchCount.textContent = "0/0";
    searchCount.title = "";
  }
}

function clearSearchHighlights() {
  document.querySelectorAll(".textLayer span").forEach((span) => {
    if (span.dataset.origHtml !== undefined) {
      span.innerHTML = span.dataset.origHtml;
      delete span.dataset.origHtml;
    }
  });
}

function performSearch(keyword) {
  clearSearchHighlights();
  searchMatches = [];
  docSearchMatches = [];
  currentSearchIndex = -1;
  currentDocSearchIndex = -1;

  if (!keyword || !keyword.trim()) {
    if (searchCount) {
      searchCount.textContent = "0/0";
      searchCount.title = "";
    }
    return;
  }

  const query = keyword.trim();
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");

  // 1. 同步高亮当前已挂载 DOM 的所有可见 TextLayer，提供 0ms 即时渲染反馈
  document.querySelectorAll(".textLayer").forEach((layer) => {
    layer.querySelectorAll("span").forEach((span) => {
      const text = span.textContent;
      if (text && regex.test(text)) {
        if (span.dataset.origHtml === undefined) {
          span.dataset.origHtml = span.innerHTML;
        }
        span.innerHTML = text.replace(regex, '<mark class="search-highlight">$1</mark>');
      }
    });
  });

  searchMatches = Array.from(document.querySelectorAll(".search-highlight"));
  if (searchMatches.length > 0) {
    currentSearchIndex = 0;
    if (searchCount) {
      searchCount.textContent = `1/${searchMatches.length}`;
    }
  }

  // 2. 异步全书全文检索与跨页索引引擎（突破虚拟滚动/DOM 卸载壁垒）
  if (currentPdfDoc) {
    searchSessionId++;
    const thisSession = searchSessionId;
    searchAllPagesAcrossDoc(query, thisSession);
  }
}

// 异步跨页文本检索引擎：遍历 PDF.js 文本内容，构建全书命中索引
async function searchAllPagesAcrossDoc(query, sessionId) {
  if (searchCount) searchCount.textContent = "检索中...";
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped, "gi");
  const allMatches = [];

  for (let p = 1; p <= totalPages; p++) {
    if (searchSessionId !== sessionId) return;

    let pageText = docPageTextCache.get(p);
    if (pageText === undefined) {
      try {
        const page = await currentPdfDoc.getPage(p);
        const tc = await page.getTextContent();
        pageText = tc.items.map((it) => it.str).join(" ");
        docPageTextCache.set(p, pageText);
      } catch (e) {
        pageText = "";
      }
    }

    if (searchSessionId !== sessionId) return;

    if (pageText) {
      regex.lastIndex = 0;
      let m;
      let matchIdxOnPage = 0;
      while ((m = regex.exec(pageText)) !== null) {
        allMatches.push({
          pageNum: p,
          matchIndexOnPage: matchIdxOnPage++,
          keyword: query
        });
        if (regex.lastIndex === m.index) regex.lastIndex++;
      }
    }
  }

  if (searchSessionId !== sessionId) return;

  docSearchMatches = allMatches;
  const total = docSearchMatches.length;

  if (total > 0) {
    currentDocSearchIndex = 0;
    currentSearchIndex = 0;
    const hitPages = Array.from(new Set(docSearchMatches.map((m) => m.pageNum)));
    if (searchCount) {
      searchCount.textContent = `1/${total}`;
      searchCount.title = `全书共命中 ${total} 处，分布在第 ${hitPages.slice(0, 10).join(", ")}${hitPages.length > 10 ? "..." : ""} 页`;
    }
    activateSearchMatch(0);
  } else {
    currentDocSearchIndex = -1;
    currentSearchIndex = -1;
    if (searchCount) {
      searchCount.textContent = "0/0";
      searchCount.title = "未找到匹配项";
    }
  }
}

async function activateSearchMatch(index) {
  const total = docSearchMatches.length || searchMatches.length;
  if (total === 0 || index < 0 || index >= total) return;

  if (docSearchMatches.length > 0) {
    currentDocSearchIndex = index;
    currentSearchIndex = index;
    const match = docSearchMatches[index];
    const targetPage = match.pageNum;

    // 若目标页面尚未被渲染（处于虚拟懒加载占位态），即时按需离屏渲染该页
    const targetWrapper = pageWrappers[targetPage - 1];
    if (targetWrapper) {
      if (targetWrapper.dataset.rendered !== "true" && !targetWrapper.dataset.rendering) {
        await renderSinglePage(targetPage, targetWrapper);
      }
      applySearchHighlightToPage(targetWrapper, match.keyword);

      // 跨页定位至目标页
      scrollToPage(targetPage);

      // 高亮匹配项并平滑居中显示
      document.querySelectorAll(".search-highlight.current").forEach((m) => m.classList.remove("current"));
      const pageHls = targetWrapper.querySelectorAll(".search-highlight");
      const targetEl = pageHls[match.matchIndexOnPage] || pageHls[0] || targetWrapper;
      if (targetEl && targetEl.classList) {
        targetEl.classList.add("current");
        if (targetEl.scrollIntoView) {
          targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    }

    if (searchCount) {
      searchCount.textContent = `${index + 1}/${total}`;
    }
  } else if (searchMatches.length > 0) {
    currentSearchIndex = index;
    searchMatches.forEach((m) => m.classList.remove("current"));
    const target = searchMatches[index];
    target.classList.add("current");
    target.scrollIntoView({ behavior: "smooth", block: "center" });

    const pageWrapper = target.closest(".pdf-page-wrapper");
    if (pageWrapper && pageWrapper.dataset.pageNum) {
      const pNum = parseInt(pageWrapper.dataset.pageNum, 10);
      if (pageNumInput) pageNumInput.value = pNum;
    }

    if (searchCount) {
      searchCount.textContent = `${index + 1}/${searchMatches.length}`;
    }
  }
}

function goToNextMatch() {
  const total = docSearchMatches.length || searchMatches.length;
  if (!total) return;
  const curr = docSearchMatches.length > 0 ? currentDocSearchIndex : currentSearchIndex;
  const next = (curr + 1) % total;
  activateSearchMatch(next);
}

function goToPrevMatch() {
  const total = docSearchMatches.length || searchMatches.length;
  if (!total) return;
  const curr = docSearchMatches.length > 0 ? currentDocSearchIndex : currentSearchIndex;
  const prev = (curr - 1 + total) % total;
  activateSearchMatch(prev);
}

// -------------------------------------------------------------------------
// 全局生词与语句笔记本 (chrome.storage.local 持久化 + Markdown 导出)
// -------------------------------------------------------------------------
async function loadGlobalNotebook() {
  try {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      const res = await new Promise((resolve) => {
        chrome.storage.local.get({ youdao_global_notebook: [] }, resolve);
      });
      globalNotebook = res?.youdao_global_notebook || [];
    } else {
      const raw = localStorage.getItem("youdao_global_notebook");
      globalNotebook = raw ? JSON.parse(raw) : [];
    }
  } catch (e) {
    console.warn("Load global notebook error:", e);
    globalNotebook = [];
  }
  updateNotebookBadge();
  renderNotebookUI(notebookSearchInput?.value || "");
}

async function saveGlobalNotebook() {
  try {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      await new Promise((resolve) => {
        chrome.storage.local.set({ youdao_global_notebook: globalNotebook }, resolve);
      });
    }
    localStorage.setItem("youdao_global_notebook", JSON.stringify(globalNotebook));
  } catch (e) {
    console.warn("Save global notebook error:", e);
  }
  updateNotebookBadge();
}

function updateNotebookBadge() {
  const count = globalNotebook.length;
  if (notebookCount) notebookCount.textContent = count;
  if (notebookDrawerCount) notebookDrawerCount.textContent = `${count} 条`;
}

function toggleNotebookDrawer() {
  if (!notebookDrawer) return;
  const isOpen = notebookDrawer.classList.contains("open");
  if (isOpen) {
    closeNotebookDrawer();
  } else {
    openNotebookDrawer();
  }
}

function openNotebookDrawer() {
  if (!notebookDrawer) return;
  notebookDrawer.classList.add("open");
  if (btnNotebookToggle) btnNotebookToggle.classList.add("active");
  if (outlineDrawer) closeOutlineDrawer();
  if (annotationsDrawer) {
    annotationsDrawer.classList.remove("open");
    if (btnAnnotationsToggle) btnAnnotationsToggle.classList.remove("active");
  }
  renderNotebookUI(notebookSearchInput?.value || "");
}

function closeNotebookDrawer() {
  if (!notebookDrawer) return;
  notebookDrawer.classList.remove("open");
  if (btnNotebookToggle) btnNotebookToggle.classList.remove("active");
}

// 目录大纲抽屉开关
function toggleOutlineDrawer() {
  if (!outlineDrawer) return;
  const isOpen = outlineDrawer.classList.contains("open");
  if (isOpen) {
    closeOutlineDrawer();
  } else {
    openOutlineDrawer();
  }
}

function openOutlineDrawer() {
  if (!outlineDrawer) return;
  outlineDrawer.classList.add("open");
  if (btnOutlineToggle) btnOutlineToggle.classList.add("active");
  if (notebookDrawer) closeNotebookDrawer();
  if (annotationsDrawer) {
    annotationsDrawer.classList.remove("open");
    if (btnAnnotationsToggle) btnAnnotationsToggle.classList.remove("active");
  }
}

function closeOutlineDrawer() {
  if (!outlineDrawer) return;
  outlineDrawer.classList.remove("open");
  if (btnOutlineToggle) btnOutlineToggle.classList.remove("active");
}

function closeAllPopovers() {
  if (penMenu) penMenu.style.display = "none";
  if (rectMenu) rectMenu.style.display = "none";
  if (eraserMenu) eraserMenu.style.display = "none";
  if (recentDropdownMenu) recentDropdownMenu.style.display = "none";
  if (themeMenu) themeMenu.style.display = "none";
  hideHighlightPopup();
  hideHighlightActionPopup();
}

// =========================================================================
// 5.5 PDF 目录大纲解析与树形渲染 (TOC Outline)
// =========================================================================
async function loadPdfOutline() {
  if (!currentPdfDoc) return;
  try {
    const outline = await currentPdfDoc.getOutline();
    if (!outline || !outline.length) {
      if (outlineCount) outlineCount.style.display = "none";
      if (drawerOutlineCount) drawerOutlineCount.textContent = "0 条";
      if (outlineList) {
        outlineList.innerHTML = `
          <div class="drawer-empty-state">
            <div class="empty-state-icon">📑</div>
            <p>未检测到文档目录</p>
            <span>该 PDF 未内置大纲书签，可使用上方搜索或页码跳转</span>
          </div>
        `;
      }
      return;
    }

    let count = 0;
    function countItems(items) {
      items.forEach((it) => {
        count++;
        if (it.items && it.items.length) countItems(it.items);
      });
    }
    countItems(outline);

    if (outlineCount) {
      outlineCount.textContent = count;
      outlineCount.style.display = "inline-flex";
    }
    if (drawerOutlineCount) drawerOutlineCount.textContent = `${count} 条`;

    if (outlineList) {
      outlineList.innerHTML = "";
      const ul = document.createElement("ul");
      ul.className = "outline-tree";
      await renderOutlineItems(outline, ul);
      outlineList.appendChild(ul);
    }
  } catch (err) {
    console.warn("loadPdfOutline failed:", err);
  }
}

async function resolveDestinationPage(dest) {
  if (!dest || !currentPdfDoc) return null;
  try {
    let explicitDest = dest;
    if (typeof dest === "string") {
      explicitDest = await currentPdfDoc.getDestination(dest);
    }
    if (Array.isArray(explicitDest) && explicitDest.length > 0) {
      const pageRef = explicitDest[0];
      if (typeof pageRef === "number") {
        return pageRef + 1;
      }
      if (typeof pageRef === "object" && pageRef !== null) {
        const pageIndex = await currentPdfDoc.getPageIndex(pageRef);
        return pageIndex + 1;
      }
    }
  } catch (e) {
    console.warn("resolveDestinationPage error:", e);
  }
  return null;
}

async function renderOutlineItems(items, container) {
  // 并发解析同级大纲项目的目标页码（避免多级大纲时的严格串行 for...of await）
  const resolvedItems = await Promise.all(
    items.map(async (item) => {
      let pageNum = null;
      try {
        pageNum = await resolveDestinationPage(item.dest);
      } catch (e) {}
      return { item, pageNum };
    })
  );

  for (const { item, pageNum } of resolvedItems) {
    const li = document.createElement("li");
    li.className = "outline-item";

    const row = document.createElement("div");
    row.className = "outline-row";

    const hasChildren = item.items && item.items.length > 0;
    if (hasChildren) {
      const expander = document.createElement("span");
      expander.className = "outline-expander";
      expander.textContent = "▼";
      expander.addEventListener("click", (e) => {
        e.stopPropagation();
        expander.classList.toggle("collapsed");
        const childUl = li.querySelector(".outline-children");
        if (childUl) childUl.classList.toggle("hidden");
      });
      row.appendChild(expander);
    } else {
      const placeholder = document.createElement("span");
      placeholder.style.cssText = "width: 16px; display: inline-block; flex-shrink: 0;";
      row.appendChild(placeholder);
    }

    const titleSpan = document.createElement("span");
    titleSpan.className = "outline-title";
    titleSpan.textContent = item.title || "无标题";
    titleSpan.title = item.title || "";
    row.appendChild(titleSpan);

    if (pageNum) {
      const pageBadge = document.createElement("span");
      pageBadge.className = "outline-page";
      pageBadge.textContent = `P. ${pageNum}`;
      row.appendChild(pageBadge);

      row.addEventListener("click", () => {
        scrollToPage(pageNum);
      });
    }

    li.appendChild(row);

    if (hasChildren) {
      const childUl = document.createElement("ul");
      childUl.className = "outline-children";
      await renderOutlineItems(item.items, childUl);
      li.appendChild(childUl);
    }

    container.appendChild(li);
  }
}

// =========================================================================
// 5.6 阅读主题系统 (浅色 / 羊皮纸护眼 / 夜间暗黑)
// =========================================================================
function initTheme() {
  try {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get({ readerTheme: "light" }, (res) => {
        setTheme(res.readerTheme || "light", false);
      });
    }
  } catch (e) {}

  if (btnThemeToggle && themeMenu) {
    btnThemeToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const isVisible = themeMenu.style.display === "block";
      closeAllPopovers();
      themeMenu.style.display = isVisible ? "none" : "block";
    });
  }

  if (btnThemeLight) btnThemeLight.addEventListener("click", () => setTheme("light"));
  if (btnThemeSepia) btnThemeSepia.addEventListener("click", () => setTheme("sepia"));
  if (btnThemeDark) btnThemeDark.addEventListener("click", () => setTheme("dark"));
}

function setTheme(theme, save = true) {
  currentTheme = theme;
  document.body.classList.remove("theme-sepia", "theme-dark");

  if (btnThemeLight) btnThemeLight.classList.remove("active");
  if (btnThemeSepia) btnThemeSepia.classList.remove("active");
  if (btnThemeDark) btnThemeDark.classList.remove("active");

  if (theme === "sepia") {
    document.body.classList.add("theme-sepia");
    if (themeIcon) themeIcon.textContent = "📜";
    if (themeLabel) themeLabel.textContent = "护眼";
    if (btnThemeSepia) btnThemeSepia.classList.add("active");
  } else if (theme === "dark") {
    document.body.classList.add("theme-dark");
    if (themeIcon) themeIcon.textContent = "🌙";
    if (themeLabel) themeLabel.textContent = "暗黑";
    if (btnThemeDark) btnThemeDark.classList.add("active");
  } else {
    if (themeIcon) themeIcon.textContent = "☀️";
    if (themeLabel) themeLabel.textContent = "浅色";
    if (btnThemeLight) btnThemeLight.classList.add("active");
  }

  if (themeMenu) themeMenu.style.display = "none";

  if (save) {
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.set({ readerTheme: theme });
      }
    } catch (e) {}
  }
}

let currentAudio = null;
function playAudio(word, type = 2) {
  if (!word) return;
  try {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = "";
    }
    const clean = word.replace(/[^\w\s-]/g, "").trim();
    if (!clean) return;
    const audioType = (type === 1 || type === "1") ? 1 : 2;
    const url = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(clean)}&type=${audioType}`;
    currentAudio = new Audio(url);
    const p = currentAudio.play();
    if (p !== undefined) {
      p.catch(() => {});
    }
  } catch (e) {
    console.warn("Audio playback error:", e);
  }
}

function renderNotebookUI(filterText = "") {
  if (!notebookList) return;
  const q = (filterText || "").trim().toLowerCase();
  const filtered = q
    ? globalNotebook.filter(
        (n) =>
          (n.text || n.word || "").toLowerCase().includes(q) ||
          (n.explains && n.explains.toLowerCase().includes(q)) ||
          (n.cetTag && n.cetTag.toLowerCase().includes(q)) ||
          (n.source && n.source.toLowerCase().includes(q))
      )
    : globalNotebook;

  if (filtered.length === 0) {
    notebookList.innerHTML = `
      <div class="drawer-empty-state">
        <div class="empty-state-icon">📚</div>
        <p>${q ? "未找到匹配的笔记内容" : "生词笔记本暂无词句"}</p>
        <span>${q ? "尝试搜索其他关键词" : "在 PDF 中选中单词或长句，点击上方【加笔记】或划词浮窗【存入笔记】即可收集"}</span>
      </div>
    `;
    return;
  }

  notebookList.innerHTML = filtered
    .map((item) => {
      const wordText = item.text || item.word || "";
      const dateStr = new Date(item.createdAt || Date.now()).toLocaleDateString();
      const cetBadge = item.cetTag
        ? `<span class="note-item-cet ${item.cetTag.toLowerCase()}">${item.cetTag}</span>`
        : "";
      const phoneticSpan = item.phonetic
        ? `<span class="note-item-phonetic">${escapeHtml(item.phonetic)}</span>`
        : "";
      const isSingleWord = !wordText.includes(" ") || wordText.split(/\s+/).length <= 2;
      const audioBtn = isSingleWord
        ? `<div class="note-item-audio-group">
            <button type="button" class="note-item-audio-btn note-audio-uk" data-word="${escapeHtml(wordText)}" data-type="1" title="英音发音 🇬🇧 (UK)">🇬🇧 英</button>
            <button type="button" class="note-item-audio-btn note-audio-us" data-word="${escapeHtml(wordText)}" data-type="2" title="美音发音 🇺🇸 (US)">🇺🇸 美</button>
          </div>`
        : "";

      return `
        <div class="note-item-card" data-note-id="${item.id}">
          <div class="note-item-header">
            <div class="note-item-word-group">
              <span class="note-item-word">${escapeHtml(wordText)}</span>
              ${phoneticSpan}
              ${cetBadge}
              ${audioBtn}
            </div>
            <button type="button" class="note-item-delete" data-del-note="${item.id}" title="删除此条笔记">✕</button>
          </div>
          <div class="note-item-explains">${escapeHtml(item.explains || "")}</div>
          <div class="note-item-footer">
            <span>📖 ${escapeHtml(item.source || "PDF 文档")}</span>
            <span>${dateStr}</span>
          </div>
        </div>
      `;
    })
    .join("");

  notebookList.querySelectorAll(".note-item-audio-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const word = btn.dataset.word;
      const type = parseInt(btn.dataset.type, 10) || 2;
      if (word) playAudio(word, type);
    });
  });

  notebookList.querySelectorAll(".note-item-delete").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.delNote;
      globalNotebook = globalNotebook.filter((n) => n.id !== id);
      await saveGlobalNotebook();
      renderNotebookUI(notebookSearchInput?.value || "");
    });
  });

  notebookList.querySelectorAll(".note-item-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".note-item-audio-btn") || e.target.closest(".note-item-delete")) return;
      const word = card.querySelector(".note-item-word")?.textContent;
      if (word && currentPdfDoc) {
        toggleSearchBar(true);
        searchInput.value = word;
        performSearch(word);
        showToast(`正在文档中查找: ${word}`);
      }
    });
  });
}

async function handleAddNoteFromSelection() {
  const sel = window.getSelection();
  const text = sel ? sel.toString().trim() : "";
  if (!text) {
    toggleNotebookDrawer();
    return;
  }

  showToast("正在查询释义并加入笔记本...");
  let queryResult = null;
  try {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      queryResult = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "queryWord", word: text }, (res) => {
          resolve(res);
        });
      });
    }
  } catch (e) {}

  let phonetic = "";
  let cetTag = "";
  let explains = "";

  const data = (queryResult && queryResult.data) || queryResult;
  if (data) {
    phonetic = data.phonetic || "";
    cetTag = data.cetTag || "";
    if (Array.isArray(data.explains) && data.explains.length) {
      explains = data.explains.join("\n");
    } else if (typeof data.explains === "string" && data.explains) {
      explains = data.explains;
    } else if (data.translations && data.translations.length) {
      explains = data.translations.join("\n");
    } else if (data.webTranslation) {
      explains = data.webTranslation;
    }
  }

  if (!explains) {
    explains = "已保存至生词本（长句/段落摘录）";
  }

  const cleanText = text.replace(/\s+/g, " ");
  const newNote = {
    id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    text: cleanText,
    word: (data && data.word) || cleanText,
    phonetic: phonetic,
    cetTag: cetTag,
    explains: explains,
    source: currentDocName ? `${currentDocName} (第 ${getCurrentPageNum()} 页)` : "PDF 文档",
    createdAt: Date.now()
  };

  // 避免完全相同的词重复插入
  globalNotebook = globalNotebook.filter(
    (n) => (n.word || n.text || "").toLowerCase() !== (newNote.word || cleanText).toLowerCase()
  );
  globalNotebook.unshift(newNote);
  await saveGlobalNotebook();
  renderNotebookUI(notebookSearchInput?.value || "");
  showToast(`✅ 已存入生词笔记: ${cleanText.slice(0, 20)}`);
  openNotebookDrawer();
}

function exportNotesAsMarkdown() {
  if (!globalNotebook.length) {
    alert("笔记本目前为空，请在阅读时选词点击【加笔记】或浮窗【存入笔记】进行添加！");
    return;
  }

  const dateStr = new Date().toLocaleString();
  let md = `# 📚 有道沉浸阅读 - 生词与语句笔记本\n\n`;
  md += `> 导出时间：${dateStr} | 共 ${globalNotebook.length} 条笔记\n\n`;
  md += `---\n\n`;

  globalNotebook.forEach((item, idx) => {
    const wordText = item.text || item.word || "";
    let titleLine = `### ${idx + 1}. **${wordText}**`;
    if (item.phonetic) titleLine += ` \`${item.phonetic}\``;
    if (item.cetTag) titleLine += ` **[${item.cetTag}]**`;
    md += `${titleLine}\n\n`;

    if (item.explains) {
      md += `- **释义**：\n`;
      item.explains.split("\n").forEach((line) => {
        if (line.trim()) md += `  - ${line.trim()}\n`;
      });
    }
    md += `- **出处**：${item.source || "PDF 文档"}\n`;
    md += `- **记录时间**：${new Date(item.createdAt || Date.now()).toLocaleString()}\n\n`;
    md += `---\n\n`;
  });

  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  a.href = url;
  a.download = `有道生词笔记本_${today}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  showToast(`✅ 已成功导出 Markdown 笔记！`);
}

// 导出为标准 Anki 牌组制卡 TSV 格式
function exportNotesAsAnkiTSV() {
  if (!globalNotebook.length) {
    alert("笔记本目前为空，请在阅读时选词点击【加笔记】或浮窗【存入笔记】进行添加！");
    return;
  }

  // Anki 标准 TSV 格式：单词 \t 音标 \t 考纲标签 \t 词义解释 \t 来源文献
  // 加上 UTF-8 BOM (\uFEFF) 保证在 Windows/Mac Excel 和 Anki 导入时不乱码
  let tsvContent = "\uFEFF#separator:tab\n#html:true\n#tags column:3\n";
  tsvContent += "单词\t音标\t标签\t释义\t来源\n";

  globalNotebook.forEach((n) => {
    const word = (n.word || n.text || "").replace(/\t/g, " ").trim();
    const phonetic = (n.phonetic || "").replace(/\t/g, " ").trim();
    const cetTag = (n.cetTag || "").replace(/\t/g, " ").trim();
    const explains = (n.explains || "").replace(/\t/g, " ").replace(/\r?\n/g, "<br>").trim();
    const source = (n.source || "").replace(/\t/g, " ").trim();

    tsvContent += `${word}\t${phonetic}\t${cetTag}\t${explains}\t${source}\n`;
  });

  const blob = new Blob([tsvContent], { type: "text/tab-separated-values;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  a.href = url;
  a.download = `youdao_vocabulary_anki_${today}.tsv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  showToast("✅ 已成功导出 Anki 制卡文件 (.tsv)，可直接导入 Anki！");
}

// 监听 storage 跨页面/浮窗同步生词本
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.youdao_global_notebook) {
      globalNotebook = changes.youdao_global_notebook.newValue || [];
      updateNotebookBadge();
      renderNotebookUI(notebookSearchInput?.value || "");
    }
  });
}

// =========================================================================
// 4. 初始化文件选择、修改工具栏与全局事件
// =========================================================================
function initEvents() {
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) loadPdfFile(file);
  });

  btnOpenEmpty.addEventListener("click", () => fileInput.click());

  // 1. Edge 风格修改工具栏模式切换绑定
  toolCursor.addEventListener("click", () => setTool("cursor"));

  toolAddNote.addEventListener("click", () => handleAddNoteFromSelection());

  toolPen.addEventListener("click", (e) => {
    if (currentTool === "pen") {
      penMenu.style.display = penMenu.style.display === "block" ? "none" : "block";
      rectMenu.style.display = "none";
      eraserMenu.style.display = "none";
    } else {
      setTool("pen");
    }
  });

  toolRect.addEventListener("click", (e) => {
    if (currentTool === "rect") {
      rectMenu.style.display = rectMenu.style.display === "block" ? "none" : "block";
      penMenu.style.display = "none";
      eraserMenu.style.display = "none";
    } else {
      setTool("rect");
    }
  });

  toolEraser.addEventListener("click", (e) => {
    if (currentTool === "eraser") {
      eraserMenu.style.display = eraserMenu.style.display === "block" ? "none" : "block";
      penMenu.style.display = "none";
      rectMenu.style.display = "none";
    } else {
      setTool("eraser");
    }
  });

  toolText.addEventListener("click", () => setTool("text"));

  // 橡皮擦模式切换与清空
  btnEraserModeStroke.addEventListener("click", (e) => {
    e.stopPropagation();
    currentEraserMode = "stroke";
    btnEraserModeStroke.classList.add("active");
    btnEraserModeArea.classList.remove("active");
    eraserMenu.style.display = "none";
    showToast("橡皮擦模式：整笔擦除 (点击整画直接删除)");
  });

  btnEraserModeArea.addEventListener("click", (e) => {
    e.stopPropagation();
    currentEraserMode = "area";
    btnEraserModeArea.classList.add("active");
    btnEraserModeStroke.classList.remove("active");
    eraserMenu.style.display = "none";
    showToast("橡皮擦模式：区域擦除 (滑动擦除局部笔迹)");
  });

  btnEraserClearPage.addEventListener("click", async (e) => {
    e.stopPropagation();
    eraserMenu.style.display = "none";
    const curPage = getCurrentPageNum();
    const pageAnns = currentAnnotations.filter(
      (a) => a.pageNum === curPage && (a.type === "stroke" || a.type === "rect")
    );
    if (!pageAnns.length) {
      showToast("当前页面没有笔迹或方框标注");
      return;
    }
    if (confirm(`确定清空第 ${curPage} 页的所有笔迹和方框标注吗？`)) {
      currentAnnotations = currentAnnotations.filter(
        (a) => !(a.pageNum === curPage && (a.type === "stroke" || a.type === "rect"))
      );
      for (const ann of pageAnns) {
        await dbDeleteAnnotation(ann.id);
      }
      recordUndoAction({ type: "clear_page", items: pageAnns });
      refreshAllAnnotationViews();
      showToast(`已清空第 ${curPage} 页笔迹`);
    }
  });

  // 撤销 / 重做按钮
  btnUndo.addEventListener("click", () => performUndo());
  btnRedo.addEventListener("click", () => performRedo());

  // 全文搜索按钮与事件
  btnSearchToggle.addEventListener("click", () => toggleSearchBar());
  btnSearchClose.addEventListener("click", () => closeSearchBar());
  searchInput.addEventListener("input", (e) => performSearch(e.target.value));
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        goToPrevMatch();
      } else {
        goToNextMatch();
      }
    } else if (e.key === "Escape") {
      closeSearchBar();
    }
  });
  btnSearchNext.addEventListener("click", () => goToNextMatch());
  btnSearchPrev.addEventListener("click", () => goToPrevMatch());

  // 生词与语句笔记本抽屉事件
  btnNotebookToggle.addEventListener("click", () => toggleNotebookDrawer());
  notebookCloseBtn.addEventListener("click", () => closeNotebookDrawer());
  notebookSearchInput.addEventListener("input", (e) => renderNotebookUI(e.target.value));
  btnExportNotesMd.addEventListener("click", () => exportNotesAsMarkdown());
  if (btnExportNotesAnki) {
    btnExportNotesAnki.addEventListener("click", () => exportNotesAsAnkiTSV());
  }
  btnClearNotes.addEventListener("click", async () => {
    if (!globalNotebook.length) return;
    if (confirm(`确定清空笔记本中的全部 ${globalNotebook.length} 条生词与短语吗？此操作无法撤销。`)) {
      globalNotebook = [];
      await saveGlobalNotebook();
      renderNotebookUI();
      showToast("生词笔记本已清空");
    }
  });

  // 目录大纲抽屉开关
  if (btnOutlineToggle) {
    btnOutlineToggle.addEventListener("click", () => toggleOutlineDrawer());
  }
  if (outlineCloseBtn) {
    outlineCloseBtn.addEventListener("click", () => closeOutlineDrawer());
  }

  // 初始化阅读主题切换 (浅色 / 羊皮纸护眼 / 夜间暗黑)
  initTheme();

  // 高亮轻量气泡交互 (查词、复制、删除)
  if (hlActDict) {
    hlActDict.addEventListener("click", () => {
      if (currentActionAnnotation && currentActionAnnotation.text) {
        const text = currentActionAnnotation.text;
        const popupRect = highlightActionPopup ? highlightActionPopup.getBoundingClientRect() : null;
        const pos = popupRect ? { x: popupRect.left, y: popupRect.bottom + 8 } : null;
        hideHighlightActionPopup();
        if (typeof window.__youdaoShowWordCard === "function") {
          window.__youdaoShowWordCard(text, pos);
        } else {
          if (typeof window.__youdaoCheckSelection === "function") {
            window.__youdaoCheckSelection();
          }
          chrome.runtime.sendMessage({ action: "queryWord", word: text });
        }
      }
    });
  }
  if (hlActCopy) {
    hlActCopy.addEventListener("click", () => {
      if (currentActionAnnotation && currentActionAnnotation.text) {
        navigator.clipboard.writeText(currentActionAnnotation.text).then(() => {
          showToast("📋 已复制高亮文字到剪贴板");
        }).catch(() => {});
      }
      hideHighlightActionPopup();
    });
  }
  if (hlActDelete) {
    hlActDelete.addEventListener("click", () => {
      if (currentActionAnnotation) {
        deleteAnnotationById(currentActionAnnotation.id);
      }
      hideHighlightActionPopup();
    });
  }

  // 保存并导出修改后的 PDF
  btnSavePdf.addEventListener("click", () => exportAnnotatedPdf());

  // 最近文档下拉菜单展开/收起
  btnRecentToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = recentDropdownMenu.style.display === "block";
    recentDropdownMenu.style.display = isOpen ? "none" : "block";
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".recent-dropdown-wrapper")) {
      recentDropdownMenu.style.display = "none";
    }
    if (!e.target.closest("#tool-pen") && !e.target.closest("#pen-menu")) {
      penMenu.style.display = "none";
    }
    if (!e.target.closest("#tool-rect") && !e.target.closest("#rect-menu")) {
      rectMenu.style.display = "none";
    }
    if (!e.target.closest("#tool-eraser") && !e.target.closest("#eraser-menu")) {
      eraserMenu.style.display = "none";
    }
    if (!e.target.closest("#btn-theme-toggle") && !e.target.closest("#theme-menu")) {
      if (themeMenu) themeMenu.style.display = "none";
    }
    if (!e.target.closest("#highlight-action-popup") && !e.target.closest(".pdf-highlight-rect")) {
      hideHighlightActionPopup();
    }
    if (!e.target.closest(".highlight-popup") && !window.getSelection()?.toString().trim()) {
      hideHighlightPopup();
    }
  });

  // 标注大纲抽屉开关
  btnAnnotationsToggle.addEventListener("click", () => {
    const willOpen = !annotationsDrawer.classList.contains("open");
    if (willOpen) {
      closeNotebookDrawer();
      annotationsDrawer.classList.add("open");
      btnAnnotationsToggle.classList.add("active");
    } else {
      annotationsDrawer.classList.remove("open");
      btnAnnotationsToggle.classList.remove("active");
    }
  });
  drawerCloseBtn.addEventListener("click", () => {
    annotationsDrawer.classList.remove("open");
    btnAnnotationsToggle.classList.remove("active");
  });

  // 拖拽文件到窗口
  ["dragenter", "dragover"].forEach((name) => {
    window.addEventListener(name, (e) => {
      e.preventDefault();
      dropZone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((name) => {
    window.addEventListener(name, (e) => {
      e.preventDefault();
      dropZone.classList.remove("dragover");
    });
  });

  window.addEventListener("drop", (e) => {
    e.preventDefault();
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length > 0) {
      const f = files[0];
      const isPdf = (f.type && f.type.includes("pdf")) || (f.name && f.name.toLowerCase().endsWith(".pdf"));
      if (isPdf) {
        loadPdfFile(f);
      } else {
        alert("请拖入 PDF 格式文件！");
      }
    }
  });

  // 翻页控制
  btnPrev.addEventListener("click", () => scrollToPage(getCurrentPageNum() - 1));
  btnNext.addEventListener("click", () => scrollToPage(getCurrentPageNum() + 1));

  // 页码输入越界自纠正
  pageNumInput.addEventListener("change", () => {
    let p = parseInt(pageNumInput.value, 10);
    if (isNaN(p) || p < 1) p = 1;
    if (p > totalPages) p = totalPages;
    pageNumInput.value = p;
    scrollToPage(p);
  });

  // 缩放控制
  btnZoomIn.addEventListener("click", () => changeZoom(currentScale + 0.2));
  btnZoomOut.addEventListener("click", () => changeZoom(currentScale - 0.2));
  btnZoomFit.addEventListener("click", fitToWidth);

  // Edge 风格文本清晰度与对比度增强控制 (默认开启)
  let isTextEnhanced = localStorage.getItem("youdao_pdf_text_enhanced") !== "false";
  function updateTextEnhanceUI() {
    if (isTextEnhanced) {
      document.body.classList.add("text-enhanced");
      btnTextEnhance.classList.add("active");
      btnTextEnhance.title = "Edge 风格文本清晰度增强 (已开启，点击可关闭)";
    } else {
      document.body.classList.remove("text-enhanced");
      btnTextEnhance.classList.remove("active");
      btnTextEnhance.title = "Edge 风格文本清晰度增强 (已关闭，点击开启)";
    }
  }
  updateTextEnhanceUI();

  btnTextEnhance.addEventListener("click", () => {
    isTextEnhanced = !isTextEnhanced;
    localStorage.setItem("youdao_pdf_text_enhanced", isTextEnhanced ? "true" : "false");
    updateTextEnhanceUI();
    showToast(isTextEnhanced ? "已开启 Edge 风格文本清晰度增强" : "已切换为标准平滑模式");
  });

  // 全局键盘快捷键
  window.addEventListener("keydown", (e) => {
    // 允许 Ctrl+F 随时调出搜索
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
      e.preventDefault();
      toggleSearchBar();
      return;
    }

    // 允许 Ctrl+Z / Ctrl+Y 撤销/重做
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      if (e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA" && !e.target.isContentEditable) {
        e.preventDefault();
        if (e.shiftKey) {
          performRedo();
        } else {
          performUndo();
        }
        return;
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      if (e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA" && !e.target.isContentEditable) {
        e.preventDefault();
        performRedo();
        return;
      }
    }

    // Escape 键关闭所有弹窗、搜索与抽屉
    if (e.key === "Escape") {
      closeSearchBar();
      setTool("cursor");
      if (annotationsDrawer) {
        annotationsDrawer.classList.remove("open");
        if (btnAnnotationsToggle) btnAnnotationsToggle.classList.remove("active");
      }
      closeNotebookDrawer();
      closeOutlineDrawer();
      hideHighlightPopup();
      hideHighlightActionPopup();
      if (penMenu) penMenu.style.display = "none";
      if (rectMenu) rectMenu.style.display = "none";
      if (eraserMenu) eraserMenu.style.display = "none";
      if (recentDropdownMenu) recentDropdownMenu.style.display = "none";
      if (themeMenu) themeMenu.style.display = "none";
      return;
    }

    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;

    // 快捷键放大、缩小、自适应宽度 (兼容带 Ctrl 与不带 Ctrl)
    if ((e.ctrlKey || e.metaKey) && e.key === "0") {
      e.preventDefault();
      fitToWidth();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "=")) {
      e.preventDefault();
      changeZoom(currentScale + 0.2);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "-" || e.key === "_")) {
      e.preventDefault();
      changeZoom(currentScale - 0.2);
      return;
    }

    if (e.key === "PageUp" || (e.altKey && e.key === "ArrowLeft")) {
      e.preventDefault();
      scrollToPage(getCurrentPageNum() - 1);
    } else if (e.key === "PageDown" || (e.altKey && e.key === "ArrowRight")) {
      e.preventDefault();
      scrollToPage(getCurrentPageNum() + 1);
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      changeZoom(currentScale + 0.2);
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      changeZoom(currentScale - 0.2);
    } else if (e.key === "0") {
      e.preventDefault();
      fitToWidth();
    } else if (e.key === "Home") {
      e.preventDefault();
      scrollToPage(1);
    } else if (e.key === "End") {
      e.preventDefault();
      scrollToPage(totalPages);
    }
  });

  // Ctrl + 滚轮缩放控制 (对齐 Edge / Chrome 原生 PDF 阅读器交互习惯)
  workspace.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY;
        if (delta < 0) {
          changeZoom(currentScale + 0.1);
        } else if (delta > 0) {
          changeZoom(currentScale - 0.1);
        }
      }
    },
    { passive: false }
  );

  // 滚动监听更新当前页码并防抖写入最近阅读进度
  let scrollTicking = false;
  let progressSaveTimer = null;
  workspace.addEventListener(
    "scroll",
    () => {
      if (!scrollTicking) {
        requestAnimationFrame(() => {
          handleScrollToUpdatePage();
          scrollTicking = false;
        });
        scrollTicking = true;
      }

      clearTimeout(progressSaveTimer);
      progressSaveTimer = setTimeout(() => {
        if (currentDocId) {
          dbUpdateDocProgress(currentDocId, getCurrentPageNum());
        }
      }, 500);
    },
    { passive: true }
  );

  initEdgePalettes();
  loadGlobalNotebook();
  updateUndoRedoUI();
  initHighlightPopupEvents();
  refreshRecentUI();
}

// =========================================================================
// 5. 加载本地 PDF 文件与底层 ArrayBuffer 渲染引擎
// =========================================================================
async function loadPdfFile(file) {
  const reader = new FileReader();
  reader.onload = function () {
    const arrayBuffer = this.result;
    loadPdfData(arrayBuffer, file.name, null, 1);
  };
  reader.readAsArrayBuffer(file);
}

// 核心通用加载引擎（支持原生 File 读取与 IndexedDB 秒开）
async function loadPdfData(arrayBuffer, fileName, docId, targetPage = 1) {
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    alert("无法加载 PDF：文件数据为空或已损坏。");
    emptyState.style.display = "flex";
    pdfContainer.style.display = "none";
    return;
  }

  currentDocName = fileName;
  docTitle.textContent = fileName;
  docTitle.title = fileName;

  if (currentPdfDoc) {
    try {
      await currentPdfDoc.destroy();
    } catch (e) {}
    currentPdfDoc = null;
  }

  // 重置全文搜索与跨页索引缓存
  docPageTextCache.clear();
  docSearchMatches = [];
  currentDocSearchIndex = -1;

  // 关键：保留完整的 ArrayBuffer，供后续保存导出使用
  currentDocBuffer = arrayBuffer.slice(0);
  currentDocKey = `${fileName}_${currentDocBuffer.byteLength}`;
  currentDocId = docId || `doc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // 分离出专供 PDF.js Web Worker 转移使用和本地数据库存储的独立拷贝
  const bufferForPdfjs = arrayBuffer.slice(0);
  const bufferForStorage = arrayBuffer.slice(0);

  try {
    emptyState.style.display = "none";
    pdfContainer.style.display = "flex";
    pdfContainer.innerHTML = `<div style="color: #fff; padding: 40px; font-size: 15px;">正在加载 PDF 文档并以 4K 超清矢量模式渲染...</div>`;

    const typedArray = new Uint8Array(bufferForPdfjs);
    currentPdfDoc = await pdfjsLib.getDocument({
      data: typedArray,
      cMapUrl: "lib/pdfjs/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "lib/pdfjs/standard_fonts/"
    }).promise;

    totalPages = currentPdfDoc.numPages;
    pageCountSpan.textContent = totalPages;
    pageNumInput.max = totalPages;
    pageNumInput.value = targetPage;

    try {
      const firstPage = await currentPdfDoc.getPage(1);
      const unscaledViewport = firstPage.getViewport({ scale: 1.0 });
      const availableWidth = Math.max(400, workspace.clientWidth - 48);
      let calculatedScale = Math.round((availableWidth / unscaledViewport.width) * 10) / 10;
      currentScale = Math.max(0.8, Math.min(1.5, calculatedScale));
      zoomText.textContent = `${Math.round(currentScale * 100)}%`;
    } catch (e) {
      currentScale = 1.2;
    }

    // 存入 IndexedDB
    dbSaveRecentDoc(
      {
        id: currentDocId,
        pdfKey: currentDocKey,
        name: fileName,
        size: bufferForStorage.byteLength,
        totalPages: totalPages,
        lastPage: targetPage
      },
      bufferForStorage
    );

    // 读取并载入已保存的修改与标注 (高亮、手绘笔迹、文字笔记)
    currentAnnotations = await dbGetAnnotations(currentDocKey);
    updateAnnotationsUI();

    // 解析并构建 PDF 目录大纲 (TOC)
    loadPdfOutline();

    await renderAllPages();

    if (targetPage > 1) {
      setTimeout(() => scrollToPage(targetPage), 150);
    }
  } catch (err) {
    alert("解析 PDF 文件失败：" + err.message);
    emptyState.style.display = "flex";
    pdfContainer.style.display = "none";
  }
}

// =========================================================================
// 6. 页面渲染、多图层构建与视口懒加载 (前/后各预载 3 页，总活跃 7~8 页)
// =========================================================================
async function renderAllPages(anchorPage = null, pageOffsetRatio = 0, isTopZero = false, scrollRatio = 0) {
  if (!currentPdfDoc) return;
  const generation = ++renderGenerationId;

  if (pageObserver) {
    pageObserver.disconnect();
    pageObserver = null;
  }

  pdfContainer.innerHTML = "";
  pageWrappers = [];

  // 1. 获取第一页作为基准比例（绝大多数学术 PDF 全文页面尺寸完全一致）
  let defaultWidth = 800;
  let defaultHeight = 1130;
  try {
    const firstPage = await currentPdfDoc.getPage(1);
    const vp = firstPage.getViewport({ scale: currentScale });
    defaultWidth = Math.round(vp.width);
    defaultHeight = Math.round(vp.height);
    pageViewportMap.set(1, { width: defaultWidth, height: defaultHeight });
  } catch (e) {}

  // 2. 毫秒级极速建立所有页面的骨架容器，撑开完整滚动条高度（零耗时，避免百页 OOM）
  for (let num = 1; num <= totalPages; num++) {
    const wrapper = document.createElement("div");
    wrapper.className = "pdf-page-wrapper unrendered";
    wrapper.dataset.pageNum = num;
    wrapper.dataset.rendered = "false";

    const cachedVp = pageViewportMap.get(num);
    const w = cachedVp ? cachedVp.width : defaultWidth;
    const h = cachedVp ? cachedVp.height : defaultHeight;
    wrapper.style.width = `${w}px`;
    wrapper.style.height = `${h}px`;

    pdfContainer.appendChild(wrapper);
    pageWrappers.push(wrapper);
  }

  // 恢复滚动锚点（在挂载视口观察器前先对齐视口位置，避免产生错误的首屏触发）
  if (workspace && pageWrappers.length && anchorPage !== null) {
    if (isTopZero) {
      workspace.scrollTop = 0;
    } else {
      const targetWrap = pageWrappers[anchorPage - 1];
      if (targetWrap) {
        workspace.scrollTop = targetWrap.offsetTop + pageOffsetRatio * targetWrap.offsetHeight;
      } else {
        workspace.scrollTop = scrollRatio * workspace.scrollHeight;
      }
    }
  }

  // 3. 挂载视口观察器（前后各预载 3 页，缓冲区 3500px）
  setupPageObserver(generation);

  // 4. 首屏立即主动渲染当前可见页及前后预载页，实现打开即现、绝对零白屏
  const curPage = anchorPage || getCurrentPageNum() || 1;
  const startP = Math.max(1, curPage - 3);
  const endP = Math.min(totalPages, curPage + 3);
  for (let p = startP; p <= endP; p++) {
    const wrap = pageWrappers[p - 1];
    if (wrap && wrap.dataset.rendered !== "true" && !wrap.dataset.rendering) {
      renderSinglePage(p, wrap, generation);
    }
  }

  // 若当前正处于搜索状态，重新对新页面文本层渲染高亮匹配
  if (searchBar && searchBar.style.display !== "none" && searchInput && searchInput.value.trim()) {
    performSearch(searchInput.value.trim());
  }
}

// 配置基于当前页前后各预载 3 页 (3500px) 的视口 IntersectionObserver
function setupPageObserver(currentGen) {
  if (pageObserver) {
    pageObserver.disconnect();
  }

  pageObserver = new IntersectionObserver(
    (entries) => {
      if (currentGen !== renderGenerationId) return;
      entries.forEach((entry) => {
        const wrapper = entry.target;
        const pageNum = parseInt(wrapper.dataset.pageNum, 10);
        if (entry.isIntersecting) {
          // 进入 3500px 预载视口区域 (前后约 3 页)
          if (wrapper.dataset.rendered !== "true" && !wrapper.dataset.rendering) {
            renderSinglePage(pageNum, wrapper, currentGen);
          }
        } else {
          // 离开视口超出 3500px 范围，卸载 Canvas 释放显存，保留骨架占位
          if (wrapper.dataset.rendered === "true") {
            unloadSinglePage(pageNum, wrapper);
          }
        }
      });
    },
    {
      root: workspace,
      rootMargin: `${PRELOAD_BUFFER_PX}px 0px ${PRELOAD_BUFFER_PX}px 0px`,
      threshold: 0
    }
  );

  pageWrappers.forEach((wrapper) => pageObserver.observe(wrapper));
}

// 卸载离开视口的页面以释放显存，保持滚动条位置不发生任何跳变
function unloadSinglePage(pageNum, wrapper) {
  wrapper.innerHTML = "";
  wrapper.classList.remove("rendered");
  wrapper.classList.add("unrendered");
  wrapper.dataset.rendered = "false";
  delete wrapper.dataset.rendering;
}

async function renderSinglePage(num, wrapper, generation = null) {
  if (!wrapper || wrapper.dataset.rendering) return;
  wrapper.dataset.rendering = "true";

  let page;
  try {
    page = await currentPdfDoc.getPage(num);
  } catch (err) {
    delete wrapper.dataset.rendering;
    return;
  }

  if (generation && generation !== renderGenerationId) {
    delete wrapper.dataset.rendering;
    return;
  }
  const dpr = window.devicePixelRatio || 1;
  // 采用超采样率 (Supersampling DPR)，最低 2.0x，高分屏 2.25x~3.0x，保证矢量字形以高密度栅格化，彻底消除边缘发虚和笔画缺失
  const renderDpr = Math.min(Math.max(dpr * 1.5, 2.0), 3.0);

  const displayViewport = page.getViewport({ scale: currentScale });
  const renderViewport = page.getViewport({ scale: currentScale * renderDpr });

  const displayWidth = Math.round(displayViewport.width);
  const displayHeight = Math.round(displayViewport.height);
  const pixelWidth = Math.round(renderViewport.width);
  const pixelHeight = Math.round(renderViewport.height);

  wrapper.style.width = `${displayWidth}px`;
  wrapper.style.height = `${displayHeight}px`;
  wrapper.innerHTML = "";

  // 0. 先行加载字体与文本内容，确保内嵌字体（如 NotoSansSC-Thin、DejaVuSerif 等）已注入到 document.fonts，避免渲染时字形降级
  let textContent = null;
  try {
    textContent = await page.getTextContent();
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  } catch (e) {}

  // 1. 底层 PDF 物理渲染 Canvas
  const canvas = document.createElement("canvas");
  canvas.className = "pdf-canvas";
  const ctx = canvas.getContext("2d", { alpha: false });

  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;

  // 显式纯白背景并启用全精度抗锯齿
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, pixelWidth, pixelHeight);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  wrapper.appendChild(canvas);

  await page.render({
    canvasContext: ctx,
    viewport: renderViewport,
    background: "rgb(255, 255, 255)"
  }).promise;

  // 2. 文本荧光高亮层 (HTML 矩形，100% 贴合文字)
  const hlLayer = document.createElement("div");
  hlLayer.className = "highlight-layer";
  hlLayer.dataset.pageNum = num;
  wrapper.appendChild(hlLayer);
  renderPageHighlights(num, hlLayer);

  // 3. 手绘画笔图层 (Canvas，支持任意线条、圈注、签名与画笔擦除)
  const drawCanvas = document.createElement("canvas");
  drawCanvas.className = "draw-canvas";
  drawCanvas.dataset.pageNum = num;
  drawCanvas.width = pixelWidth;
  drawCanvas.height = pixelHeight;
  drawCanvas.style.width = `${displayWidth}px`;
  drawCanvas.style.height = `${displayHeight}px`;
  wrapper.appendChild(drawCanvas);
  renderPageDrawings(num, drawCanvas);
  setupDrawingOnCanvas(drawCanvas, num, displayWidth, displayHeight, pixelWidth, pixelHeight);

  // 4. 文字批注层 (可编辑文字卡片，支持随处点击添加笔记与拖动)
  const textAnnotationLayer = document.createElement("div");
  textAnnotationLayer.className = "text-annotation-layer";
  textAnnotationLayer.dataset.pageNum = num;
  wrapper.appendChild(textAnnotationLayer);
  renderPageTextBoxes(num, textAnnotationLayer);
  setupTextBoxCreation(textAnnotationLayer, num, displayWidth, displayHeight);

  // 5. 文本选择层 (字母级精确对齐，支持查词与划句翻译)
  if (!textContent) {
    try {
      textContent = await page.getTextContent();
    } catch (e) {
      textContent = { items: [], styles: {} };
    }
  }

  if (textContent.styles) {
    for (const [fontName, style] of Object.entries(textContent.styles)) {
      const fontObj = page.commonObjs && page.commonObjs.has(fontName) ? page.commonObjs.get(fontName) : null;
      const rawName = (fontObj && fontObj.name) || fontName;
      const cleanName = rawName.replace(/^[A-Z]{6}\+/, "").trim();

      const isMonospace = (fontObj && fontObj.isMonospace) || /mono|courier|consolas|menlo|code/i.test(cleanName);
      const isSerif = (fontObj && fontObj.isSerifFont) || /serif|times|roman|georgia|garamond|cambria|baskerville|minion|palatino|song|ming|kai/i.test(cleanName);

      let fontStack = "";
      if (isMonospace) {
        fontStack = `"${fontName}", "${cleanName}", "Courier New", Courier, Consolas, monospace`;
      } else if (isSerif) {
        const spacedName = cleanName.replace(/([a-z])([A-Z])/g, "$1 $2");
        fontStack = `"${fontName}", "${cleanName}", "${spacedName}", "Times New Roman", Times, Georgia, serif`;
      } else {
        const spacedName = cleanName.replace(/([a-z])([A-Z])/g, "$1 $2");
        fontStack = `"${fontName}", "${cleanName}", "${spacedName}", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`;
      }
      style.fontFamily = fontStack;
    }
  }

  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  } catch (e) {}

  const textLayerDiv = document.createElement("div");
  textLayerDiv.className = "textLayer";
  textLayerDiv.dataset.pageNum = num;
  textLayerDiv.style.width = `${displayWidth}px`;
  textLayerDiv.style.height = `${displayHeight}px`;

  textLayerDiv.style.setProperty("--scale-factor", displayViewport.scale);
  wrapper.style.setProperty("--scale-factor", displayViewport.scale);
  wrapper.appendChild(textLayerDiv);

  await pdfjsLib.renderTextLayer({
    textContentSource: textContent,
    container: textLayerDiv,
    viewport: displayViewport,
    textDivs: []
  }).promise;

  // 6. 空白处选词防崩溃与智能吸附
  const endOfContent = document.createElement("div");
  endOfContent.className = "endOfContent";
  textLayerDiv.appendChild(endOfContent);

  textLayerDiv.addEventListener("mousedown", (evt) => {
    if (currentTool !== "cursor" && currentTool !== "highlighter") return;

    if (evt.target !== textLayerDiv) {
      const bounds = textLayerDiv.getBoundingClientRect();
      const r = Math.max(0, (evt.clientY - bounds.top) / bounds.height);
      endOfContent.style.top = (r * 100).toFixed(2) + "%";
    } else {
      const nearestSpan = findNearestSpanOnLine(textLayerDiv, evt.clientX, evt.clientY);
      if (nearestSpan) {
        const sel = window.getSelection();
        if (sel && nearestSpan.firstChild) {
          sel.collapse(nearestSpan.firstChild, 0);
        }
      } else {
        endOfContent.style.top = "0%";
      }
    }
    endOfContent.classList.add("active");
  });

  const clearEndOfContent = () => {
    endOfContent.style.top = "";
    endOfContent.classList.remove("active");
  };
  textLayerDiv.addEventListener("mouseup", clearEndOfContent);
  textLayerDiv.addEventListener("mouseleave", clearEndOfContent);

  // 7. 标记页面渲染完毕
  wrapper.classList.remove("unrendered");
  wrapper.classList.add("rendered");
  wrapper.dataset.rendered = "true";
  delete wrapper.dataset.rendering;

  // 8. 若当前处于全文搜索激活状态，为该页 TextLayer 渲染黄色高亮
  if (searchBar && searchBar.style.display !== "none" && searchInput && searchInput.value.trim()) {
    applySearchHighlightToPage(wrapper, searchInput.value.trim());
  }
}

// 为刚进入视口的新渲染页面注入搜索高亮
function applySearchHighlightToPage(wrapper, keyword) {
  if (!keyword || !keyword.trim()) return;
  const escaped = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const layer = wrapper.querySelector(".textLayer");
  if (!layer) return;

  layer.querySelectorAll("span").forEach((span) => {
    const text = span.textContent;
    if (text && regex.test(text)) {
      if (span.dataset.origHtml === undefined) {
        span.dataset.origHtml = span.innerHTML;
      }
      span.innerHTML = text.replace(regex, '<mark class="search-highlight">$1</mark>');
    }
  });

  searchMatches = Array.from(document.querySelectorAll(".search-highlight"));
  if (searchCount && searchMatches.length > 0) {
    searchCount.textContent = `${Math.max(1, currentSearchIndex + 1)}/${searchMatches.length}`;
  }
}

function findNearestSpanOnLine(textLayerDiv, clientX, clientY) {
  const spans = textLayerDiv.querySelectorAll("span");
  let closest = null;
  let minHorizDist = 45;

  for (const span of spans) {
    const rect = span.getBoundingClientRect();
    if (clientY >= rect.top - 6 && clientY <= rect.bottom + 6) {
      const dist = Math.abs(clientX - (clientX < rect.left ? rect.left : rect.right));
      if (dist < minHorizDist) {
        minHorizDist = dist;
        closest = span;
      }
    }
  }
  return closest;
}

// =========================================================================
// 7. 手写绘制、方框标注与橡皮擦交互逻辑 (Edge 原生贝塞尔平滑与物理线宽校准)
// =========================================================================

/**
 * 笔迹微抖动滤波去噪器 (3点高斯加权核 [0.2, 0.6, 0.2])
 * 消除鼠标物理传感器采样抖动与微阶梯锯齿，同时严格锚定笔画起点与终点
 */
function smoothStrokePoints(points) {
  if (!points || points.length <= 2) return points;
  const smoothed = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    smoothed.push({
      xPct: 0.2 * prev.xPct + 0.6 * cur.xPct + 0.2 * next.xPct,
      yPct: 0.2 * prev.yPct + 0.6 * cur.yPct + 0.2 * next.yPct
    });
  }
  smoothed.push(points[points.length - 1]);
  return smoothed;
}

/**
 * 顶级抗锯齿平滑手绘画线引擎
 * 结合 Centripetal Catmull-Rom 三次贝塞尔拟合 (Cubic Bézier Spline)
 * 与控制点自适应钳位，彻底根除毛刺、折角、硬直线与边缘锯齿感
 */
function drawSmoothStroke(ctx, pts, canvasWidth, canvasHeight, strokeColor, lineWidth, isHighlighter) {
  if (!pts || pts.length === 0) return;
  ctx.save();
  ctx.strokeStyle = strokeColor;
  ctx.fillStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (isHighlighter) {
    ctx.globalAlpha = 0.45;
    ctx.globalCompositeOperation = "multiply";
  } else {
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = "source-over";
  }

  // 转换百分比坐标为物理 Canvas 像素坐标
  const p = pts.map((pt) => ({
    x: (pt.xPct / 100) * canvasWidth,
    y: (pt.yPct / 100) * canvasHeight
  }));

  const n = p.length;

  if (n === 1) {
    ctx.beginPath();
    ctx.arc(p[0].x, p[0].y, Math.max(1, lineWidth / 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (n === 2) {
    ctx.beginPath();
    ctx.moveTo(p[0].x, p[0].y);
    ctx.lineTo(p[1].x, p[1].y);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (n === 3) {
    ctx.beginPath();
    ctx.moveTo(p[0].x, p[0].y);
    const midX = (p[1].x + p[2].x) / 2;
    const midY = (p[1].y + p[2].y) / 2;
    ctx.quadraticCurveTo(p[1].x, p[1].y, midX, midY);
    ctx.lineTo(p[2].x, p[2].y);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // 4点及以上：应用限制型 Catmull-Rom 三次贝塞尔曲线插值 (Centripetal Catmull-Rom to Cubic Bézier)
  // 保证曲线不仅无折角、无锯齿，且严格通过用户绘制的每一个真实点位，且绝不产生多余过冲环
  ctx.beginPath();
  ctx.moveTo(p[0].x, p[0].y);

  for (let i = 0; i < n - 1; i++) {
    const p0 = i === 0 ? { x: 2 * p[0].x - p[1].x, y: 2 * p[0].y - p[1].y } : p[i - 1];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = i + 2 >= n ? { x: 2 * p[n - 1].x - p[n - 2].x, y: 2 * p[n - 1].y - p[n - 2].y } : p[i + 2];

    let dx1 = (p2.x - p0.x) / 6;
    let dy1 = (p2.y - p0.y) / 6;
    let dx2 = (p3.x - p1.x) / 6;
    let dy2 = (p3.y - p1.y) / 6;

    const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const maxCtrl = segLen / 2.4;

    const len1 = Math.hypot(dx1, dy1);
    if (len1 > maxCtrl && len1 > 0) {
      const scale1 = maxCtrl / len1;
      dx1 *= scale1;
      dy1 *= scale1;
    }

    const len2 = Math.hypot(dx2, dy2);
    if (len2 > maxCtrl && len2 > 0) {
      const scale2 = maxCtrl / len2;
      dx2 *= scale2;
      dy2 *= scale2;
    }

    const cp1 = { x: p1.x + dx1, y: p1.y + dy1 };
    const cp2 = { x: p2.x - dx2, y: p2.y - dy2 };

    ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, p2.x, p2.y);
  }

  ctx.stroke();
  ctx.restore();
}

function renderPageDrawings(pageNum, drawCanvas) {
  const ctx = drawCanvas.getContext("2d");
  ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const displayWidth = parseFloat(drawCanvas.style.width) || (drawCanvas.width / (window.devicePixelRatio || 1));
  const scale = drawCanvas.width / displayWidth;

  // 1. 绘制方框标注 (type === "rect")
  const rects = currentAnnotations.filter((a) => a.pageNum === pageNum && a.type === "rect");
  rects.forEach((r) => {
    ctx.save();
    ctx.strokeStyle = r.color || "#e61b1b";
    ctx.lineWidth = (r.width || 2) * scale;
    ctx.lineCap = "square";
    ctx.lineJoin = "miter";
    const x = (r.xPct / 100) * drawCanvas.width;
    const y = (r.yPct / 100) * drawCanvas.height;
    const w = (r.wPct / 100) * drawCanvas.width;
    const h = (r.hPct / 100) * drawCanvas.height;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  });

  // 2. 绘制手绘笔迹 (type === "stroke") - 采用贝塞尔平滑
  const strokes = currentAnnotations.filter((a) => a.pageNum === pageNum && a.type === "stroke");
  strokes.forEach((str) => {
    if (!str.points || !str.points.length) return;
    drawSmoothStroke(
      ctx,
      str.points,
      drawCanvas.width,
      drawCanvas.height,
      str.color,
      (str.width || 2) * scale,
      str.isHighlighter
    );
  });
}

function setupDrawingOnCanvas(drawCanvas, pageNum, displayWidth, displayHeight, pixelWidth, pixelHeight) {
  let isDrawing = false;
  let isDrawingRect = false;
  let currentStroke = null;
  let rectStart = null;
  const ctx = drawCanvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const scale = pixelWidth / displayWidth;

  const getCanvasCoords = (e) => {
    const rect = drawCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return {
      xPct: Math.max(0, Math.min(100, (x / displayWidth) * 100)),
      yPct: Math.max(0, Math.min(100, (y / displayHeight) * 100)),
      canvasX: (x / displayWidth) * pixelWidth,
      canvasY: (y / displayHeight) * pixelHeight
    };
  };

  drawCanvas.addEventListener("pointerdown", (e) => {
    if (currentTool === "pen") {
      isDrawing = true;
      const coords = getCanvasCoords(e);
      currentStroke = {
        id: `stroke_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: "stroke",
        pdfKey: currentDocKey,
        pageNum: pageNum,
        color: currentPenColor,
        width: currentPenWidth,
        isHighlighter: false,
        points: [{ xPct: coords.xPct, yPct: coords.yPct }]
      };
      drawCanvas.setPointerCapture(e.pointerId);
    } else if (currentTool === "rect") {
      isDrawingRect = true;
      rectStart = getCanvasCoords(e);
      drawCanvas.setPointerCapture(e.pointerId);
    } else if (currentTool === "eraser") {
      eraseStrokeAt(getCanvasCoords(e), pageNum, drawCanvas);
    }
  });

  drawCanvas.addEventListener("pointermove", (e) => {
    if (isDrawing && currentStroke) {
      // 提取子帧事件集合，充分利用高回报率鼠标/触摸板硬件采样
      const events = (typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : null) || [e];
      let hasNewPoint = false;
      const pts = currentStroke.points;

      for (const ev of events) {
        const coords = getCanvasCoords(ev);
        const last = pts[pts.length - 1];
        const dxDisp = ((coords.xPct - last.xPct) / 100) * displayWidth;
        const dyDisp = ((coords.yPct - last.yPct) / 100) * displayHeight;
        const distDisp = Math.hypot(dxDisp, dyDisp);

        // 仅在物理移动距离 >= 1.5 屏幕 CSS 像素时录入新节点，彻底滤除原地点按堆积的微小突刺
        if (distDisp >= 1.5) {
          pts.push({ xPct: coords.xPct, yPct: coords.yPct });
          hasNewPoint = true;
        }
      }

      if (hasNewPoint) {
        // 动态重绘当前笔画并应用 Catmull-Rom 三次贝塞尔平滑
        renderPageDrawings(pageNum, drawCanvas);
        drawSmoothStroke(
          ctx,
          smoothStrokePoints(pts),
          pixelWidth,
          pixelHeight,
          currentStroke.color,
          currentStroke.width * scale,
          false
        );
      }
    } else if (isDrawingRect && rectStart) {
      const coords = getCanvasCoords(e);
      // 清空并重绘已有标注
      renderPageDrawings(pageNum, drawCanvas);
      // 实时绘制方框拉拽预览
      ctx.save();
      ctx.strokeStyle = currentRectColor;
      ctx.lineWidth = currentRectWidth * scale;
      ctx.lineCap = "square";
      ctx.lineJoin = "miter";
      const startX = rectStart.canvasX;
      const startY = rectStart.canvasY;
      const curX = coords.canvasX;
      const curY = coords.canvasY;
      ctx.strokeRect(
        Math.min(startX, curX),
        Math.min(startY, curY),
        Math.abs(curX - startX),
        Math.abs(curY - startY)
      );
      ctx.restore();
    } else if (currentTool === "eraser" && e.buttons === 1) {
      eraseStrokeAt(getCanvasCoords(e), pageNum, drawCanvas);
    }
  });

  const finishDrawing = (e) => {
    if (isDrawing && currentStroke) {
      isDrawing = false;
      const coords = getCanvasCoords(e);
      const pts = currentStroke.points;
      const last = pts[pts.length - 1];
      if (last) {
        const dxDisp = ((coords.xPct - last.xPct) / 100) * displayWidth;
        const dyDisp = ((coords.yPct - last.yPct) / 100) * displayHeight;
        if (Math.hypot(dxDisp, dyDisp) >= 1.0) {
          pts.push({ xPct: coords.xPct, yPct: coords.yPct });
        }
      }

      if (currentStroke.points.length >= 2) {
        // 完成笔画时应用平滑去抖滤波，消除传感器阶梯杂音
        currentStroke.points = smoothStrokePoints(currentStroke.points);
        currentAnnotations.push(currentStroke);
        dbSaveAnnotation(currentStroke);
        recordUndoAction({ type: "add", item: currentStroke });
        updateAnnotationsUI();
      }
      currentStroke = null;
      renderPageDrawings(pageNum, drawCanvas);
    } else if (isDrawingRect && rectStart) {
      isDrawingRect = false;
      const coords = getCanvasCoords(e);
      const minXPct = Math.min(rectStart.xPct, coords.xPct);
      const minYPct = Math.min(rectStart.yPct, coords.yPct);
      const wPct = Math.abs(coords.xPct - rectStart.xPct);
      const hPct = Math.abs(coords.yPct - rectStart.yPct);

      // 至少有 0.3% 的微小范围，防止误触原地点按产生空方框
      if (wPct > 0.3 && hPct > 0.3) {
        const newRect = {
          id: `rect_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: "rect",
          pdfKey: currentDocKey,
          pageNum: pageNum,
          xPct: Math.round(minXPct * 100) / 100,
          yPct: Math.round(minYPct * 100) / 100,
          wPct: Math.round(wPct * 100) / 100,
          hPct: Math.round(hPct * 100) / 100,
          color: currentRectColor,
          width: currentRectWidth,
          createdAt: Date.now()
        };
        currentAnnotations.push(newRect);
        dbSaveAnnotation(newRect);
        recordUndoAction({ type: "add", item: newRect });
        updateAnnotationsUI();
      }
      rectStart = null;
      renderPageDrawings(pageNum, drawCanvas);
    }
  };

  drawCanvas.addEventListener("pointerup", finishDrawing);
  drawCanvas.addEventListener("pointercancel", finishDrawing);
}

// 橡皮擦双模式检测：整笔擦除 (Stroke) + 区域擦除 (Area)
function eraseStrokeAt(coords, pageNum, drawCanvas) {
  if (currentEraserMode === "stroke") {
    // 1. 整笔擦除：只要点击命中了笔画或方框的任意位置，整条标注直接删除
    const thresholdPct = 2.5; // 2.5% 碰撞范围
    const toDelete = [];

    currentAnnotations.forEach((ann) => {
      if (ann.pageNum !== pageNum) return;

      if (ann.type === "stroke" && ann.points) {
        for (const pt of ann.points) {
          const dist = Math.hypot(pt.xPct - coords.xPct, pt.yPct - coords.yPct);
          if (dist < thresholdPct) {
            toDelete.push(ann);
            break;
          }
        }
      } else if (ann.type === "rect") {
        const x1 = ann.xPct;
        const y1 = ann.yPct;
        const x2 = ann.xPct + ann.wPct;
        const y2 = ann.yPct + ann.hPct;
        const px = coords.xPct;
        const py = coords.yPct;

        const nearLeft = Math.abs(px - x1) <= thresholdPct && py >= y1 - thresholdPct && py <= y2 + thresholdPct;
        const nearRight = Math.abs(px - x2) <= thresholdPct && py >= y1 - thresholdPct && py <= y2 + thresholdPct;
        const nearTop = Math.abs(py - y1) <= thresholdPct && px >= x1 - thresholdPct && px <= x2 + thresholdPct;
        const nearBottom = Math.abs(py - y2) <= thresholdPct && px >= x1 - thresholdPct && px <= x2 + thresholdPct;

        if (nearLeft || nearRight || nearTop || nearBottom) {
          toDelete.push(ann);
        }
      }
    });

    if (toDelete.length > 0) {
      toDelete.forEach((ann) => {
        currentAnnotations = currentAnnotations.filter((a) => a.id !== ann.id);
        dbDeleteAnnotation(ann.id);
        recordUndoAction({ type: "delete", item: ann });
      });
      renderPageDrawings(pageNum, drawCanvas);
      updateAnnotationsUI();
    }
  } else {
    // 2. 区域擦除：按住滑动时，局部清除落入橡皮圆圈内的笔画节点
    const radiusPct = 2.0; // 区域擦除半径
    let modified = false;
    const toDelete = [];

    currentAnnotations.forEach((ann) => {
      if (ann.pageNum !== pageNum) return;

      if (ann.type === "rect") {
        const x1 = ann.xPct;
        const y1 = ann.yPct;
        const x2 = ann.xPct + ann.wPct;
        const y2 = ann.yPct + ann.hPct;
        const px = coords.xPct;
        const py = coords.yPct;

        const nearLeft = Math.abs(px - x1) <= radiusPct && py >= y1 - radiusPct && py <= y2 + radiusPct;
        const nearRight = Math.abs(px - x2) <= radiusPct && py >= y1 - radiusPct && py <= y2 + radiusPct;
        const nearTop = Math.abs(py - y1) <= radiusPct && px >= x1 - radiusPct && px <= x2 + radiusPct;
        const nearBottom = Math.abs(py - y2) <= radiusPct && px >= x1 - radiusPct && px <= x2 + radiusPct;

        if (nearLeft || nearRight || nearTop || nearBottom) {
          toDelete.push(ann);
        }
      } else if (ann.type === "stroke" && ann.points) {
        const remaining = ann.points.filter(
          (pt) => Math.hypot(pt.xPct - coords.xPct, pt.yPct - coords.yPct) >= radiusPct
        );
        if (remaining.length !== ann.points.length) {
          modified = true;
          if (remaining.length < 2) {
            toDelete.push(ann);
          } else {
            ann.points = remaining;
            dbSaveAnnotation(ann);
          }
        }
      }
    });

    if (toDelete.length > 0) {
      toDelete.forEach((ann) => {
        currentAnnotations = currentAnnotations.filter((a) => a.id !== ann.id);
        dbDeleteAnnotation(ann.id);
        recordUndoAction({ type: "delete", item: ann });
      });
      modified = true;
    }

    if (modified) {
      renderPageDrawings(pageNum, drawCanvas);
      updateAnnotationsUI();
    }
  }
}

// =========================================================================
// 8. 文字批注层交互逻辑 (添加文本卡片、随处输入、删除)
// =========================================================================
function renderPageTextBoxes(pageNum, textLayer) {
  textLayer.innerHTML = "";
  const boxes = currentAnnotations.filter((a) => a.pageNum === pageNum && a.type === "text_box");

  boxes.forEach((box) => {
    const boxEl = createTextBoxElement(box, pageNum);
    textLayer.appendChild(boxEl);
  });
}

function createTextBoxElement(boxData, pageNum) {
  const el = document.createElement("div");
  el.className = "pdf-text-box";
  el.dataset.boxId = boxData.id;
  el.style.left = `${boxData.xPct}%`;
  el.style.top = `${boxData.yPct}%`;

  const contentDiv = document.createElement("div");
  contentDiv.className = "pdf-text-box-content";
  contentDiv.contentEditable = "true";
  contentDiv.textContent = boxData.text || "";

  // 纯文本粘贴防护：杜绝外部富文本/HTML格式污染
  contentDiv.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData)?.getData("text/plain") || "";
    document.execCommand("insertText", false, text);
  });

  // 输入清理：当用户退格全部文字时，清理残留的 <br> 确保 :empty 占位符正常回显
  contentDiv.addEventListener("input", () => {
    if (!contentDiv.textContent.trim() && contentDiv.innerHTML !== "") {
      contentDiv.innerHTML = "";
    }
  });

  const delBtn = document.createElement("span");
  delBtn.className = "pdf-text-box-delete";
  delBtn.textContent = "✕";
  delBtn.title = "删除此文字批注";
  delBtn.contentEditable = "false";
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteAnnotationById(boxData.id);
  });

  el.appendChild(contentDiv);
  el.appendChild(delBtn);

  el.addEventListener("click", (e) => {
    if (e.target === delBtn) return;
    contentDiv.focus();
  });

  // 失去焦点时保存
  contentDiv.addEventListener("blur", () => {
    const rawText = contentDiv.innerText.trim();
    if (!rawText) {
      if (!boxData.text) {
        // 未录入过有效内容的临时文本框，直接从数组与 DOM 移除，并撤销其刚刚压入的 add 动作，避免污染撤销栈
        currentAnnotations = currentAnnotations.filter((a) => a.id !== boxData.id);
        if (undoStack.length && undoStack[undoStack.length - 1].item?.id === boxData.id) {
          undoStack.pop();
          btnUndo.disabled = undoStack.length === 0;
          btnUndo.style.opacity = undoStack.length === 0 ? "0.35" : "1";
          btnUndo.style.cursor = undoStack.length === 0 ? "not-allowed" : "pointer";
        }
        el.remove();
        updateAnnotationsUI();
      } else {
        deleteAnnotationById(boxData.id);
      }
    } else {
      boxData.text = rawText;
      dbSaveAnnotation(boxData);
      updateAnnotationsUI();
    }
  });

  return el;
}

function setupTextBoxCreation(textLayer, pageNum, displayWidth, displayHeight) {
  textLayer.addEventListener("click", (e) => {
    if (currentTool !== "text") return;
    if (e.target.closest(".pdf-text-box")) return;

    const rect = textLayer.getBoundingClientRect();
    const xPct = Math.max(2, Math.min(85, ((e.clientX - rect.left) / displayWidth) * 100));
    const yPct = Math.max(2, Math.min(95, ((e.clientY - rect.top) / displayHeight) * 100));

    const newBox = {
      id: `tb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: "text_box",
      pdfKey: currentDocKey,
      pageNum: pageNum,
      xPct: Math.round(xPct * 100) / 100,
      yPct: Math.round(yPct * 100) / 100,
      text: "",
      createdAt: Date.now()
    };

    currentAnnotations.push(newBox);
    recordUndoAction({ type: "add", item: newBox });
    const boxEl = createTextBoxElement(newBox, pageNum);
    textLayer.appendChild(boxEl);

    // 聚焦文本框准备输入
    setTimeout(() => {
      const input = boxEl.querySelector(".pdf-text-box-content") || boxEl;
      input.focus();
    }, 20);
  });
}

// =========================================================================
// 9. 划选荧光高亮层逻辑 (贴合文字矩形)
// =========================================================================
function renderPageHighlights(pageNum, hlLayer) {
  hlLayer.innerHTML = "";
  const pageAnns = currentAnnotations.filter((a) => a.pageNum === pageNum && (!a.type || a.type === "highlight"));

  pageAnns.forEach((ann) => {
    if (!ann.rects || !Array.isArray(ann.rects)) return;
    ann.rects.forEach((r) => {
      const rectDiv = document.createElement("div");
      rectDiv.className = `pdf-highlight-rect hl-${ann.color}`;
      rectDiv.dataset.annId = ann.id;
      rectDiv.style.left = `${r.leftPct}%`;
      rectDiv.style.top = `${r.topPct}%`;
      rectDiv.style.width = `${r.widthPct}%`;
      rectDiv.style.height = `${r.heightPct}%`;
      rectDiv.title = `第 ${ann.pageNum} 页标注: "${ann.text?.slice(0, 30)}..." (点击可删除)`;

      rectDiv.addEventListener("click", (e) => {
        e.stopPropagation();
        if (currentTool === "eraser") {
          deleteAnnotationById(ann.id);
        } else {
          showHighlightActionPopup(ann, e.clientX, e.clientY);
        }
      });

      hlLayer.appendChild(rectDiv);
    });
  });
}

// =========================================================================
// 8.5 高亮标注非阻塞操作气泡 (Non-blocking Highlight Action Popup)
// =========================================================================
function showHighlightActionPopup(ann, x, y) {
  if (!highlightActionPopup) return;
  currentActionAnnotation = ann;

  highlightActionPopup.style.display = "flex";
  const popW = 200;
  const popH = 34;
  const vpW = window.innerWidth;
  const vpH = window.innerHeight;

  let left = Math.min(x, vpW - popW - 10);
  let top = y - popH - 8;
  if (top < 60) top = y + 16;
  left = Math.max(10, left);

  highlightActionPopup.style.left = `${left}px`;
  highlightActionPopup.style.top = `${top}px`;
}

function hideHighlightActionPopup() {
  if (highlightActionPopup) {
    highlightActionPopup.style.display = "none";
  }
  currentActionAnnotation = null;
}

function initHighlightPopupEvents() {
  document.addEventListener("mouseup", () => {
    if (currentTool !== "cursor" && currentTool !== "highlighter") return;
    setTimeout(checkAndShowHighlightPopup, 20);
  });

  highlightPopup.querySelectorAll(".hl-color-btn").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const color = btn.dataset.color || "yellow";
      applyHighlight(color);
    });
  });
}

function checkAndShowHighlightPopup() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) {
    hideHighlightPopup();
    return;
  }

  const text = sel.toString().trim();
  if (!text || text.length > 500) {
    hideHighlightPopup();
    return;
  }

  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width <= 0 && rect.height <= 0) {
    hideHighlightPopup();
    return;
  }

  // 跨页容错：检测选区端点是否包含在有效 PDF 页面容器内
  const startEl = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
  const endEl = range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentElement;
  const pageWrapper = startEl?.closest(".pdf-page-wrapper") || endEl?.closest(".pdf-page-wrapper");

  if (!pageWrapper) {
    hideHighlightPopup();
    return;
  }

  const popupWidth = 140;
  const popupHeight = 32;
  let top = rect.top - popupHeight - 8;
  let left = rect.left + rect.width / 2 - popupWidth / 2;

  if (top < 60) {
    top = rect.bottom + 8;
  }
  left = Math.max(10, Math.min(left, window.innerWidth - popupWidth - 10));

  highlightPopup.style.top = `${top}px`;
  highlightPopup.style.left = `${left}px`;
  highlightPopup.classList.add("visible");
}

function hideHighlightPopup() {
  highlightPopup.classList.remove("visible");
}

async function applyHighlight(color) {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return;

  const text = sel.toString().trim();
  if (!text) return;

  const range = sel.getRangeAt(0);
  const clientRects = Array.from(range.getClientRects());
  if (!clientRects.length) return;

  // 跨页选区高亮智能切片 (Selection Slicing，将跨越页面边界的 Range 矩形根据页面边界分割为各页独立标注并持久化)
  const wrappers = Array.from(document.querySelectorAll(".pdf-page-wrapper"));
  if (!wrappers.length) return;

  // 收集并切片归类属于不同页面的 Range 矩形
  const pageSlices = new Map(); // pageNum -> { wrapper, rects: [] }

  for (const r of clientRects) {
    if (r.width <= 1 || r.height <= 1) continue;
    const midY = r.top + r.height / 2;
    const midX = r.left + r.width / 2;

    let targetWrapper = null;
    for (const w of wrappers) {
      const b = w.getBoundingClientRect();
      if (midY >= b.top && midY <= b.bottom && midX >= b.left && midX <= b.right) {
        targetWrapper = w;
        break;
      }
    }

    if (!targetWrapper) {
      for (const w of wrappers) {
        const b = w.getBoundingClientRect();
        if (r.top < b.bottom && r.bottom > b.top) {
          targetWrapper = w;
          break;
        }
      }
    }

    if (targetWrapper && targetWrapper.dataset.pageNum) {
      const pNum = parseInt(targetWrapper.dataset.pageNum, 10);
      if (!pageSlices.has(pNum)) {
        pageSlices.set(pNum, { wrapper: targetWrapper, rects: [] });
      }
      pageSlices.get(pNum).rects.push(r);
    }
  }

  if (pageSlices.size === 0) return;

  for (const [pageNum, slice] of pageSlices.entries()) {
    const wrapperRect = slice.wrapper.getBoundingClientRect();
    const rectsPct = slice.rects
      .map((r) => {
        const leftPct = Math.max(0, ((r.left - wrapperRect.left) / wrapperRect.width) * 100);
        const topPct = Math.max(0, ((r.top - wrapperRect.top) / wrapperRect.height) * 100);
        const widthPct = Math.min(100, (r.width / wrapperRect.width) * 100);
        const heightPct = Math.min(100, (r.height / wrapperRect.height) * 100);
        return {
          leftPct: Math.round(leftPct * 100) / 100,
          topPct: Math.round(topPct * 100) / 100,
          widthPct: Math.round(widthPct * 100) / 100,
          heightPct: Math.round(heightPct * 100) / 100
        };
      })
      .filter((r) => r.widthPct > 0.5 && r.heightPct > 0.5);

    if (rectsPct.length === 0) continue;

    const newAnn = {
      id: "ann_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6) + "_p" + pageNum,
      type: "highlight",
      pdfKey: currentDocKey,
      pageNum: pageNum,
      text: text,
      color: color,
      rects: rectsPct,
      createdAt: Date.now()
    };

    currentAnnotations.push(newAnn);
    await dbSaveAnnotation(newAnn);
    recordUndoAction({ type: "add", item: newAnn });

    const hlLayer = slice.wrapper.querySelector(".highlight-layer");
    if (hlLayer) {
      renderPageHighlights(pageNum, hlLayer);
    }
  }

  updateAnnotationsUI();
  hideHighlightPopup();
  sel.removeAllRanges();
}

async function deleteAnnotationById(id) {
  const target = currentAnnotations.find((a) => a.id === id);
  if (target) {
    recordUndoAction({ type: "delete", item: target });
  }

  currentAnnotations = currentAnnotations.filter((a) => a.id !== id);
  await dbDeleteAnnotation(id);

  document.querySelectorAll(".pdf-page-wrapper").forEach((wrapper) => {
    const pageNum = parseInt(wrapper.dataset.pageNum, 10);
    const hlLayer = wrapper.querySelector(".highlight-layer");
    const drawCanvas = wrapper.querySelector(".draw-canvas");
    const textLayer = wrapper.querySelector(".text-annotation-layer");
    if (hlLayer) renderPageHighlights(pageNum, hlLayer);
    if (drawCanvas) renderPageDrawings(pageNum, drawCanvas);
    if (textLayer) renderPageTextBoxes(pageNum, textLayer);
  });
  updateAnnotationsUI();
}

function updateAnnotationsUI() {
  const count = currentAnnotations.length;
  annotationsCountSpan.textContent = count;
  drawerCountSpan.textContent = `${count} 条`;

  if (count === 0) {
    drawerList.innerHTML = `
      <div class="drawer-empty-state">
        <div class="empty-state-icon">📝</div>
        <p>暂无页面标注内容</p>
        <span>在 PDF 页面中使用手绘、方框或添加文本即可生成标注</span>
      </div>
    `;
    return;
  }

  const sorted = [...currentAnnotations].sort((a, b) => a.pageNum - b.pageNum || a.createdAt - b.createdAt);

  drawerList.innerHTML = sorted
    .map((ann) => {
      let typeLabel = "高亮";
      let dotColor = ann.color || "#ffd600";
      let content = ann.text || "手写笔迹";

      if (ann.type === "stroke") {
        typeLabel = ann.isHighlighter ? "手画高亮" : "手写线条";
        dotColor = ann.color;
      } else if (ann.type === "rect") {
        typeLabel = "方框标注";
        dotColor = ann.color || "#e53935";
        content = `矩形框 (${Math.round(ann.wPct)}% × ${Math.round(ann.hPct)}%)`;
      } else if (ann.type === "text_box") {
        typeLabel = "文字笔记";
        dotColor = "#e53935";
        content = ann.text || "(空笔记)";
      }

      return `
      <div class="annotation-item" data-ann-id="${ann.id}" data-page-num="${ann.pageNum}">
        <div class="annotation-item-header">
          <div class="annotation-tag-group">
            <span class="annotation-color-dot" style="background-color: ${dotColor};"></span>
            <span class="annotation-page">第 ${ann.pageNum} 页 · ${typeLabel}</span>
          </div>
          <button type="button" class="annotation-delete-btn" data-del-ann-id="${ann.id}" title="删除此项">✕</button>
        </div>
        <p class="annotation-text">${escapeHtml(content)}</p>
      </div>
    `;
    })
    .join("");

  drawerList.querySelectorAll(".annotation-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      if (e.target.closest(".annotation-delete-btn")) return;
      const pageNum = parseInt(item.dataset.pageNum, 10);
      scrollToPage(pageNum);
      const targetWrapper = pageWrappers[pageNum - 1];
      if (targetWrapper) {
        targetWrapper.style.transition = "box-shadow 0.3s";
        targetWrapper.style.boxShadow = "0 0 0 4px #e53935";
        setTimeout(() => {
          targetWrapper.style.boxShadow = "";
        }, 1200);
      }
    });
  });

  drawerList.querySelectorAll(".annotation-delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.delAnnId;
      deleteAnnotationById(id);
    });
  });
}

// =========================================================================
// 10. 保存与导出已标注文档 (PDF 另存为 / 打印 / 自动落盘)
// =========================================================================
function parseColorRgba(colorStr) {
  if (!colorStr) return { r: 1.0, g: 0.92, b: 0.23, a: 0.35 };
  if (colorStr === "yellow") return { r: 1.0, g: 0.92, b: 0.23, a: 0.35 };
  if (colorStr === "green") return { r: 0.40, g: 0.88, b: 0.40, a: 0.35 };
  if (colorStr === "blue") return { r: 0.38, g: 0.70, b: 1.0, a: 0.35 };
  if (colorStr === "pink") return { r: 1.0, g: 0.46, b: 0.65, a: 0.35 };
  if (colorStr.startsWith("#")) {
    const hex = colorStr.replace("#", "");
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16) / 255,
        g: parseInt(hex.slice(2, 4), 16) / 255,
        b: parseInt(hex.slice(4, 6), 16) / 255,
        a: 0.35
      };
    }
  }
  return { r: 1.0, g: 0.92, b: 0.23, a: 0.35 };
}

async function exportAnnotatedPdf() {
  if (!currentPdfDoc || !pageWrappers.length) {
    alert("请先打开一份 PDF 文档！");
    return;
  }

  showToast("正在合并渲染并生成已标注文档...");

  // 纯前端无损矢量 PDF 导出升级 (基于 pdf-lib，保留原 PDF 矢量文字、目录大纲与高清晰度)
  if (typeof PDFLib !== "undefined" && currentDocBuffer) {
    try {
      showToast("正在通过 pdf-lib 生成无损矢量标注文档...");
      const { PDFDocument, rgb } = window.PDFLib;
      const pdfDoc = await PDFDocument.load(currentDocBuffer.slice(0));
      const pages = pdfDoc.getPages();

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const pageNum = i + 1;
        const { width: pWidth, height: pHeight } = page.getSize();

        // 1. 原生矢量高亮批注 (保留原 PDF 矢量文字、目录大纲与高清晰度)
        const pageHls = currentAnnotations.filter((a) => a.pageNum === pageNum && (!a.type || a.type === "highlight"));
        for (const ann of pageHls) {
          if (!ann.rects || !ann.rects.length) continue;
          const c = parseColorRgba(ann.color);
          for (const r of ann.rects) {
            const rx = (r.leftPct / 100) * pWidth;
            const rw = (r.widthPct / 100) * pWidth;
            const rh = (r.heightPct / 100) * pHeight;
            const ry = pHeight - ((r.topPct + r.heightPct) / 100) * pHeight;
            page.drawRectangle({
              x: rx,
              y: ry,
              width: rw,
              height: rh,
              color: rgb(c.r, c.g, c.b),
              opacity: c.a !== undefined ? c.a : 0.35
            });
          }
        }

        // 2. 手绘墨水笔迹与便签文本图层 (以高分辨率透明矢量图层叠加，不破坏底层原文本与字体)
        const pageDraws = currentAnnotations.filter((a) => a.pageNum === pageNum && (a.type === "stroke" || a.type === "rect"));
        const pageTbs = currentAnnotations.filter((a) => a.pageNum === pageNum && a.type === "text_box");

        if (pageDraws.length > 0 || pageTbs.length > 0) {
          const overlayCanvas = document.createElement("canvas");
          const dpr = 2.0; // 2x 超采样保证墨水与文字高清
          overlayCanvas.width = Math.round(pWidth * dpr);
          overlayCanvas.height = Math.round(pHeight * dpr);
          const oCtx = overlayCanvas.getContext("2d");
          oCtx.imageSmoothingEnabled = true;
          oCtx.imageSmoothingQuality = "high";

          // 绘制方框
          pageDraws.filter((a) => a.type === "rect").forEach((r) => {
            oCtx.save();
            oCtx.strokeStyle = r.color || "#e61b1b";
            oCtx.lineWidth = (r.width || 2) * dpr;
            const x = (r.xPct / 100) * overlayCanvas.width;
            const y = (r.yPct / 100) * overlayCanvas.height;
            const w = (r.wPct / 100) * overlayCanvas.width;
            const h = (r.hPct / 100) * overlayCanvas.height;
            oCtx.strokeRect(x, y, w, h);
            oCtx.restore();
          });

          // 绘制贝塞尔曲线墨水手绘
          pageDraws.filter((a) => a.type === "stroke").forEach((str) => {
            if (!str.points || !str.points.length) return;
            drawSmoothStroke(
              oCtx,
              str.points,
              overlayCanvas.width,
              overlayCanvas.height,
              str.color,
              (str.width || 2) * dpr,
              str.isHighlighter
            );
          });

          // 绘制便签卡片与文字
          pageTbs.forEach((tb) => {
            if (!tb.text) return;
            const tx = (tb.xPct / 100) * overlayCanvas.width;
            const ty = (tb.yPct / 100) * overlayCanvas.height;
            const lines = tb.text.split("\n");
            const fontSize = Math.round(13 * dpr);
            const lineH = Math.round(18 * dpr);
            oCtx.save();
            oCtx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
            const maxW = Math.max(...lines.map((l) => oCtx.measureText(l).width)) + 16 * dpr;
            const totalH = lines.length * lineH + 12 * dpr;

            oCtx.fillStyle = "rgba(255, 255, 255, 0.95)";
            oCtx.strokeStyle = "#e53935";
            oCtx.lineWidth = 1.5 * dpr;
            oCtx.fillRect(tx, ty, maxW, totalH);
            oCtx.strokeRect(tx, ty, maxW, totalH);

            oCtx.fillStyle = "#1a1a1a";
            lines.forEach((line, idx) => {
              oCtx.fillText(line, tx + 8 * dpr, ty + (idx + 1) * lineH - 2 * dpr);
            });
            oCtx.restore();
          });

          const pngDataUrl = overlayCanvas.toDataURL("image/png");
          const embeddedOverlay = await pdfDoc.embedPng(pngDataUrl);
          page.drawImage(embeddedOverlay, {
            x: 0,
            y: 0,
            width: pWidth,
            height: pHeight
          });
        }
      }

      const pdfBytes = await pdfDoc.save();
      const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
      const downloadUrl = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      const saveName = (currentDocName || "document").replace(/\.pdf$/i, "") + "_已标注文档.pdf";
      a.href = downloadUrl;
      a.download = saveName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);

      showToast(`✅ 无损矢量 PDF 导出成功：${saveName}`);
      return;
    } catch (vectorErr) {
      console.warn("pdf-lib vector export failed, falling back to raster exporter:", vectorErr);
    }
  }

  // 降级兜底方案：光栅图合成导出
  try {
    const pageImages = [];

    for (let i = 0; i < pageWrappers.length; i++) {
      const wrapper = pageWrappers[i];
      const pageNum = i + 1;
      let pdfCanvas = wrapper.querySelector(".pdf-canvas");
      let drawCanvas = wrapper.querySelector(".draw-canvas");

      if (!pdfCanvas) {
        await renderSinglePage(pageNum, wrapper);
        pdfCanvas = wrapper.querySelector(".pdf-canvas");
        drawCanvas = wrapper.querySelector(".draw-canvas");
      }

      if (!pdfCanvas) continue;

      const mergeCanvas = document.createElement("canvas");
      mergeCanvas.width = pdfCanvas.width;
      mergeCanvas.height = pdfCanvas.height;
      const mCtx = mergeCanvas.getContext("2d");

      mCtx.drawImage(pdfCanvas, 0, 0);

      const pageHls = currentAnnotations.filter((a) => a.pageNum === pageNum && (!a.type || a.type === "highlight"));
      pageHls.forEach((ann) => {
        if (!ann.rects) return;
        mCtx.save();
        mCtx.fillStyle = getHighlighterRgba(ann.color);
        mCtx.globalCompositeOperation = "multiply";
        ann.rects.forEach((r) => {
          const rx = (r.leftPct / 100) * mergeCanvas.width;
          const ry = (r.topPct / 100) * mergeCanvas.height;
          const rw = (r.widthPct / 100) * mergeCanvas.width;
          const rh = (r.heightPct / 100) * mergeCanvas.height;
          mCtx.fillRect(rx, ry, rw, rh);
        });
        mCtx.restore();
      });

      if (drawCanvas) {
        mCtx.drawImage(drawCanvas, 0, 0);
      }

      const pageTbs = currentAnnotations.filter((a) => a.pageNum === pageNum && a.type === "text_box");
      if (pageTbs.length > 0) {
        mCtx.save();
        mCtx.font = `bold ${Math.round(13 * (mergeCanvas.width / 800))}px -apple-system, sans-serif`;
        pageTbs.forEach((tb) => {
          if (!tb.text) return;
          const tx = (tb.xPct / 100) * mergeCanvas.width;
          const ty = (tb.yPct / 100) * mergeCanvas.height;
          const lines = tb.text.split("\n");
          const lineH = Math.round(18 * (mergeCanvas.width / 800));
          const maxW = Math.max(...lines.map((l) => mCtx.measureText(l).width)) + 16;
          const totalH = lines.length * lineH + 12;

          mCtx.fillStyle = "rgba(255, 255, 255, 0.95)";
          mCtx.strokeStyle = "#e53935";
          mCtx.lineWidth = 1.5;
          mCtx.fillRect(tx, ty, maxW, totalH);
          mCtx.strokeRect(tx, ty, maxW, totalH);

          mCtx.fillStyle = "#1a1a1a";
          lines.forEach((line, idx) => {
            mCtx.fillText(line, tx + 8, ty + (idx + 1) * lineH - 2);
          });
        });
        mCtx.restore();
      }

      const dataUrl = mergeCanvas.toDataURL("image/jpeg", 0.92);
      pageImages.push({
        width: Math.round(pdfCanvas.width * 0.75),
        height: Math.round(pdfCanvas.height * 0.75),
        dataUrl: dataUrl
      });
    }

    const pdfBlob = generatePdfBlobFromImages(pageImages);
    const downloadUrl = URL.createObjectURL(pdfBlob);
    const a = document.createElement("a");
    const saveName = (currentDocName || "document").replace(/\.pdf$/i, "") + "_已修改.pdf";
    a.href = downloadUrl;
    a.download = saveName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);

    showToast(`✅ 已自动保存至本地书架，并成功导出：${saveName}`);
  } catch (err) {
    alert("生成 PDF 导出失败：" + err.message);
  }
}

// 纯前端极速生成多页矢量包围 PDF 二进制 Blob
function generatePdfBlobFromImages(images) {
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  let objCount = 2; // 1: Catalog, 2: Pages

  offsets.push(0, 0); // 占位

  const catalogId = 1;
  const pagesId = 2;
  const pageIds = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const base64Data = img.dataUrl.split(",")[1];
    const binaryStr = atob(base64Data);
    const imgLen = binaryStr.length;

    const imgObjId = ++objCount;
    offsets.push(pdf.length);

    const imgHeader = `${imgObjId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgLen} >>\nstream\n`;
    const imgFooter = "\nendstream\nendobj\n";

    pdf += imgHeader + binaryStr + imgFooter;

    const contentStr = `q ${img.width} 0 0 ${img.height} 0 0 cm /Im${i + 1} Do Q`;
    const contentId = ++objCount;
    offsets.push(pdf.length);
    pdf += `${contentId} 0 obj\n<< /Length ${contentStr.length} >>\nstream\n${contentStr}\nendstream\nendobj\n`;

    const pageId = ++objCount;
    offsets.push(pdf.length);
    pdf += `${pageId} 0 obj\n<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${img.width} ${img.height}] /Contents ${contentId} 0 R /Resources << /XObject << /Im${i + 1} ${imgObjId} 0 R >> >> >>\nendobj\n`;
    pageIds.push(pageId);
  }

  // Catalog 和 Pages
  offsets[catalogId - 1] = pdf.length;
  pdf += `${catalogId} 0 obj\n<< /Type /Catalog /Pages ${pagesId} 0 R >>\nendobj\n`;

  offsets[pagesId - 1] = pdf.length;
  pdf += `${pagesId} 0 obj\n<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>\nendobj\n`;

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objCount + 1}\n0000000000 65535 f \n`;
  for (let i = 0; i < objCount; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objCount + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  // 转换为 Uint8Array
  const buffer = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) {
    buffer[i] = pdf.charCodeAt(i) & 0xff;
  }
  return new Blob([buffer], { type: "application/pdf" });
}

// =========================================================================
let isZooming = false;
let pendingZoomScale = null;

async function changeZoom(newScale) {
  newScale = Math.max(0.6, Math.min(3.0, Math.round(newScale * 10) / 10));
  if (newScale === currentScale) return;
  if (isZooming) {
    pendingZoomScale = newScale;
    return;
  }
  isZooming = true;

  try {
    // 1. 记录缩放前的滚动锚点 (Scroll Anchoring)
    let anchorPage = getCurrentPageNum() || 1;
    let pageOffsetRatio = 0;
    const scrollY = workspace ? workspace.scrollTop : 0;
    const isTopZero = scrollY === 0;
    const prevScrollHeight = workspace ? workspace.scrollHeight : 0;
    const scrollRatio = prevScrollHeight > 0 ? scrollY / prevScrollHeight : 0;

    if (pageWrappers.length && workspace) {
      for (let i = 0; i < pageWrappers.length; i++) {
        const wrap = pageWrappers[i];
        if (wrap.offsetTop + wrap.offsetHeight > scrollY) {
          anchorPage = i + 1;
          const offsetInPage = Math.max(0, scrollY - wrap.offsetTop);
          pageOffsetRatio = wrap.offsetHeight > 0 ? offsetInPage / wrap.offsetHeight : 0;
          break;
        }
      }
    }

    currentScale = newScale;
    pageViewportMap.clear();
    zoomText.textContent = `${Math.round(currentScale * 100)}%`;

    await renderAllPages(anchorPage, pageOffsetRatio, isTopZero, scrollRatio);

    // 2. 恢复滚动锚点，消除跳变并刷新当前页码指示
    if (workspace && pageWrappers.length) {
      if (isTopZero) {
        workspace.scrollTop = 0;
      } else {
        const targetWrap = pageWrappers[anchorPage - 1];
        if (targetWrap) {
          workspace.scrollTop = targetWrap.offsetTop + pageOffsetRatio * targetWrap.offsetHeight;
        } else {
          workspace.scrollTop = scrollRatio * workspace.scrollHeight;
        }
      }
      handleScrollToUpdatePage();
    }
  } finally {
    isZooming = false;
    if (pendingZoomScale !== null && pendingZoomScale !== currentScale) {
      const nextScale = pendingZoomScale;
      pendingZoomScale = null;
      await changeZoom(nextScale);
    } else {
      pendingZoomScale = null;
    }
  }
}

function fitToWidth() {
  if (!pageWrappers.length || !currentPdfDoc) return;
  const availableWidth = Math.max(500, workspace.clientWidth - 60);
  currentPdfDoc
    .getPage(1)
    .then((page) => {
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const fitScale = Math.round((availableWidth / unscaledViewport.width) * 10) / 10;
      changeZoom(fitScale);
    })
    .catch(() => {});
}

function scrollToPage(pageNum) {
  if (pageNum < 1 || pageNum > totalPages) return;
  const targetWrapper = pageWrappers[pageNum - 1];
  if (targetWrapper) {
    targetWrapper.scrollIntoView({ behavior: "smooth", block: "start" });
    pageNumInput.value = pageNum;
  }
}

function getCurrentPageNum() {
  return parseInt(pageNumInput.value, 10) || 1;
}

function handleScrollToUpdatePage() {
  if (!pageWrappers.length) return;
  const scrollY = workspace.scrollTop;
  let activePage = 1;

  for (let i = 0; i < pageWrappers.length; i++) {
    const offsetTop = pageWrappers[i].offsetTop;
    if (offsetTop - 100 <= scrollY) {
      activePage = i + 1;
    } else {
      break;
    }
  }

  if (parseInt(pageNumInput.value, 10) !== activePage) {
    pageNumInput.value = activePage;
  }
}

function escapeHtml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// 启动事件绑定与初始化
initEvents();
