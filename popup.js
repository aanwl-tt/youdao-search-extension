/**
 * 有道划词搜索 - Popup 脚本
 */

document.addEventListener("DOMContentLoaded", async () => {
  const toggleFloating = document.getElementById("toggle-floating");
  const toggleBackground = document.getElementById("toggle-background");
  const selectClickAction = document.getElementById("select-click-action");
  const selectPosition = document.getElementById("select-position");
  const searchForm = document.getElementById("search-form");
  const searchInput = document.getElementById("search-input");
  const btnOpenReader = document.getElementById("btn-open-reader");

  // 1. 读取并回显设置
  try {
    const settings = await chrome.storage.sync.get({
      enableFloating: true,
      openInBackground: false,
      buttonPosition: "bottom",
      clickAction: "popup"
    });
    toggleFloating.checked = settings.enableFloating !== false;
    toggleBackground.checked = settings.openInBackground === true;
    if (selectPosition) {
      selectPosition.value = settings.buttonPosition || "bottom";
    }
    if (selectClickAction) {
      selectClickAction.value = settings.clickAction || "popup";
    }
  } catch (err) {
    console.error("Failed to load settings:", err);
  }

  // 2. 绑定开关与选择框保存事件
  toggleFloating.addEventListener("change", () => {
    chrome.storage.sync.set({ enableFloating: toggleFloating.checked });
  });

  toggleBackground.addEventListener("change", () => {
    chrome.storage.sync.set({ openInBackground: toggleBackground.checked });
  });

  if (selectPosition) {
    selectPosition.addEventListener("change", () => {
      chrome.storage.sync.set({ buttonPosition: selectPosition.value });
    });
  }

  if (selectClickAction) {
    selectClickAction.addEventListener("change", () => {
      chrome.storage.sync.set({ clickAction: selectClickAction.value });
    });
  }

  // 3. 打开内置 PDF 阅读器
  if (btnOpenReader) {
    btnOpenReader.addEventListener("click", () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("reader.html") });
      window.close();
    });
  }

  // 4. 显示生词本词汇总数
  const popupNotesCount = document.getElementById("popup-notes-count");
  if (popupNotesCount && typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    try {
      chrome.storage.local.get({ youdao_global_notebook: [] }, (res) => {
        const count = (res.youdao_global_notebook || []).length;
        popupNotesCount.textContent = `📚 ${count} 词`;
      });
    } catch (e) {}
  }

  // 5. 绑定快速查词提交
  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const query = searchInput.value.trim();
    if (!query) return;

    chrome.runtime.sendMessage({
      action: "searchWord",
      word: query,
      inBackground: toggleBackground.checked
    });

    window.close();
  });
});
