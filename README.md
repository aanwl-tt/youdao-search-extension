# 有道词典划词搜索 & Edge 风格沉浸式 PDF 阅读器

<p align="center">
  <img src="icons/icon128.png" width="96" height="96" alt="Youdao Search Logo" />
</p>

<p align="center">
  <strong>专为学术论文精读、四六级/考研英语备考与深度长文阅读打造的 Chromium / Edge 浏览器扩展</strong>
</p>

<p align="center">
  <a href="https://github.com/aanwl-tt/youdao-search-extension/releases/latest"><img src="https://img.shields.io/github/v/release/aanwl-tt/youdao-search-extension?color=red&label=Latest%20Release" alt="Latest Release" /></a>
  <img src="https://img.shields.io/badge/Manifest-V3-blue.svg" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/Browser-Edge%20%7C%20Chrome-success.svg" alt="Edge | Chrome" />
  <img src="https://img.shields.io/badge/License-MIT-brightgreen.svg" alt="License" />
</p>

---

## ⚡ 极速体验下载

> 想要直接安装使用？无需安装 Node 或编译环境，直接前往 **[Releases 页面](../../releases/latest)** 下载已打包好的 ZIP 扩展包即可！

👉 **[下载最新版本扩展包 (v1.6.0 .zip)](https://github.com/aanwl-tt/youdao-search-extension/releases/latest)**

---

## ✨ 核心特性一览

### 1. 🌐 网页即时划词与 Shadow DOM 释义浮窗
- **就地释义，不打断阅读**：划选单词或短语，点击微标即就地弹出卡片，告别切新标签页的频繁打扰。
- **英 🇬🇧 / 美 🇺🇸 双发音**：独立音标与双口音点播胶囊按钮，听感纯正。
- **考纲标签识别**：智能解析并在卡片突出标记 **CET4 / CET6** 考纲词汇。
- **4~6 词短语搭配放宽**：支持识别常见固定短语与成语搭配（如 *take into account*, *in terms of* 等），优先展示词典释义。
- **📌 钉住 (Pin) 模式**：卡片支持一键钉住锁定，对照文献在外部记笔记时不因点击空白处而关闭；查新词时原地刷新不乱跳。
- **Shadow DOM 隔离**：样式严格沙箱隔离，绝不污染目标网页原有排版。

### 2. 📖 Edge 风格沉浸式本地 PDF 阅读器
- **破除浏览器原生 PDF 限制**：将本地英文论文、六级试卷或电子书拖入即可畅享自由划词查释义。
- **视口虚拟懒加载**：前后各动态预载 3 页骨架，200+ 页学术巨著秒级加载，显存占用恒定轻盈。
- **高阶缩放滚动锚定 (Scroll Anchoring)**：Ctrl+滚轮缩放时精准锁定当前视口焦点，彻底杜绝翻滚跳动。
- **羊皮纸护眼与暗黑模式**：预置浅色白底、羊皮纸暖黄护眼、深色夜间模式，护眼沉浸。

### 3. 🔍 异步全文档倒排全文检索 (Ctrl + F)
- 突破虚拟滚动 DOM 节点随时被卸载的壁垒，加载文档时后台静默建立内存倒排索引。
- 瞬间返回全书搜索命中分布（如 `1/42 (分布于 p.3, 12, 45)`）。
- 支持跨越数十页精准平滑滚动跳转并动态注入高亮标记，滚动时搜索总数绝不跳变。

### 4. 🎨 Edge 30 色手绘墨水与跨页选区切片 (Selection Slicing)
- **物理平滑曲线**：基于 Catmull-Rom 三次贝塞尔拟合算法消除手写锯齿微抖动。
- **跨页选区智能切片**：跨越两页缝隙拖选文字时，自动按页面边界进行 2D 几何切割，各页独立生成百分比标注。
- **原子级批次撤销**：Ctrl+Z 单步撤销整段跨页高亮，气泡删除自动级联清理。

### 5. 💾 纯前端无损矢量 PDF 导出 (集成 `pdf-lib`)
- 告别以前逐页截屏为低清 JPEG 位图拼接的拙劣方案。
- 直接向原 PDF 文件注入原生 `/Highlight` 矢量标注流，**导出后原文档文字依然 100% 矢量清晰、可选中复制、超链接与书签目录全量完好**，文件体积保持原版大小（仅数兆）。

### 6. 📓 跨扩展全局生词本 (Notebook)
- PDF 阅读器与网页端双向同步生词数据。
- 自动记录单词、音标、四六级标签、详细释义与出处（如 `文献名 (第 12 页)`）。
- 一键导出为 **Markdown (.md)** 格式（完美适配 Obsidian / Notion / Logseq 知识库）。
- 一键导出为 **Anki TSV 牌组**，备考复习快人一步。

---

## 🚀 安装使用指南

### 方法一：从 Release 下载已打包的 ZIP（推荐）

1. 点击前往 **[Releases 页面](https://github.com/aanwl-tt/youdao-search-extension/releases/latest)**，下载 `youdao-search-extension-v1.6.0.zip`；
2. 将下载的 ZIP 压缩包解压到本地任意文件夹（例如 `D:\Extensions\youdao-search-extension`）；
3. 打开 Microsoft Edge 或 Google Chrome 浏览器，访问：
   - Edge 浏览器：`edge://extensions/`
   - Chrome 浏览器：`chrome://extensions/`
4. 开启右上角的 **“开发者模式”**（Developer Mode）；
5. 点击左上角的 **“加载已解压的扩展程序”**（Load unpacked），选择刚刚解压的文件夹；
6. 安装完成！在浏览器右上角扩展栏固定图标即可随时使用。

### 方法二：从源码加载

```bash
# 1. 克隆本仓库到本地
git clone https://github.com/aanwl-tt/youdao-search-extension.git

# 2. 浏览器打开扩展管理页 (edge://extensions 或 chrome://extensions)
# 3. 开启开发者模式，点击“加载已解压的扩展程序”，选择仓库目录即可
```

---

## ⌨️ 常用快捷键

| 快捷键 | 功能说明 |
| :--- | :--- |
| **Ctrl + F** | 开启 / 关闭全书倒排全文检索栏 |
| **Enter / Shift + Enter** | 查找下一个 / 上一个命中词条 |
| **Ctrl + Z / Ctrl + Y** | 撤销 / 重做标注动作（支持跨页高亮单步撤销） |
| **Ctrl + 滚轮** | 智能比例平滑缩放（自动滚动锚定） |
| **Esc** | 关闭全文搜索栏 / 关闭释义浮窗卡片 / 退出全屏 |

---

## 📂 仓库目录结构

```
youdao-search-extension/
├── 📁 icons/                    # 扩展图标 (16, 48, 128)
├── 📁 lib/                      # 纯前端核心依赖 (pdf-lib, pdfjs)
├── 📁 tests/                    # 自动化回归与语义契约测试套件
├── 📁 docs/                     # 架构设计与技术交接文档
├── 📄 background.js             # Service Worker 核心消息路由器与词典客户端
├── 📄 content.js                # 网页划词浮标与 Shadow DOM 释义浮窗
├── 📄 manifest.json             # Chromium MV3 规范清单
├── 📄 popup.html / css / js     # 快捷查词与选项设置面板
├── 📄 reader.html / css / js    # 沉浸式 PDF 阅读器、批注引擎与导出器
├── 📄 .gitignore                # Git 忽略配置
└── 📄 README.md                 # 项目介绍与说明文档
```

---

## 📄 授权协议

本项目采用 [MIT License](LICENSE) 开源协议，欢迎学习与自由拓展！
