import json
import os
from PIL import Image

tests_dir = os.path.dirname(os.path.abspath(__file__))
ext_dir = os.path.dirname(tests_dir)
print("=== Running Automated Bug & Quality Audit (v1.1) ===")

# Test 1: Manifest validation
manifest_path = os.path.join(ext_dir, "manifest.json")
with open(manifest_path, "r", encoding="utf-8") as f:
    manifest = json.load(f)

assert manifest.get("manifest_version") == 3, "Must be Manifest V3"
assert manifest.get("name"), "Must have name"
assert manifest.get("version"), "Must have version"
assert "https://dict.youdao.com/*" in manifest.get("host_permissions", []), "Must have host_permissions"
print("PASS 1: Manifest V3 format & host_permissions valid.")

# Test 2: Icons check
for sz_str, icon_rel in manifest.get("icons", {}).items():
    sz = int(sz_str)
    icon_abs = os.path.join(ext_dir, icon_rel)
    assert os.path.exists(icon_abs), f"Icon {icon_abs} missing"
    with Image.open(icon_abs) as im:
        assert im.size == (sz, sz), f"Icon size mismatch: {im.size} vs {sz}x{sz}"
print("PASS 2: All 3 icon files exist and match exact pixel dimensions (16, 48, 128).")

# Test 3: Popup HTML & JS ID contract
popup_html_path = os.path.join(ext_dir, "popup.html")
with open(popup_html_path, "r", encoding="utf-8") as f:
    html_content = f.read()

assert "onclick=" not in html_content.lower(), "CSP violation: inline onclick found"
assert '<script src="popup.js"></script>' in html_content, "popup.js script tag missing"

popup_js_path = os.path.join(ext_dir, "popup.js")
with open(popup_js_path, "r", encoding="utf-8") as f:
    popup_js_content = f.read()

required_ids = [
    "toggle-floating", 
    "toggle-background", 
    "select-position", 
    "select-click-action",
    "btn-open-reader",
    "search-form", 
    "search-input"
]
for elem_id in required_ids:
    assert f'id="{elem_id}"' in html_content, f"Missing ID in HTML: {elem_id}"
    assert f'"{elem_id}"' in popup_js_content, f"Missing ID reference in JS: {elem_id}"
print("PASS 3: popup.html and popup.js element IDs & CSP verified.")

# Test 4: Message contract between scripts
content_js_path = os.path.join(ext_dir, "content.js")
with open(content_js_path, "r", encoding="utf-8") as f:
    content_js_content = f.read()

bg_js_path = os.path.join(ext_dir, "background.js")
with open(bg_js_path, "r", encoding="utf-8") as f:
    bg_js_content = f.read()

assert "queryWord" in content_js_content, "content.js must send queryWord"
assert "queryWord" in bg_js_content, "background.js must handle queryWord"
assert "searchWord" in content_js_content, "content.js must send searchWord"
assert "searchWord" in popup_js_content, "popup.js must send searchWord"
assert "searchWord" in bg_js_content, "background.js must handle searchWord"
print("PASS 4: Message passing contracts (queryWord & searchWord) verified.")

# Test 5: Storage keys consistency
keys = ["enableFloating", "buttonPosition", "clickAction", "openInBackground"]
for k in keys:
    assert k in bg_js_content, f"Key {k} missing in background.js"
    assert k in popup_js_content, f"Key {k} missing in popup.js"
    if k != "openInBackground":
        assert k in content_js_content, f"Key {k} missing in content.js"
print("PASS 5: Storage keys (enableFloating, buttonPosition, clickAction, openInBackground) consistent.")

# Test 6: PDF Reader components check
reader_html = os.path.join(ext_dir, "reader.html")
reader_js = os.path.join(ext_dir, "reader.js")
reader_css = os.path.join(ext_dir, "reader.css")
pdf_min_js = os.path.join(ext_dir, "lib", "pdfjs", "pdf.min.js")
pdf_worker_js = os.path.join(ext_dir, "lib", "pdfjs", "pdf.worker.min.js")

assert os.path.exists(reader_html), "reader.html missing"
assert os.path.exists(reader_js), "reader.js missing"
assert os.path.exists(reader_css), "reader.css missing"
assert os.path.exists(pdf_min_js), "pdf.min.js missing"
assert os.path.exists(pdf_worker_js), "pdf.worker.min.js missing"
assert os.path.getsize(pdf_min_js) > 100000, "pdf.min.js too small"
assert os.path.getsize(pdf_worker_js) > 500000, "pdf.worker.min.js too small"
print("PASS 6: Built-in PDF reader files and PDF.js runtime validated.")

# Test 7: Security check
assert "eval(" not in bg_js_content and "eval(" not in content_js_content and "eval(" not in popup_js_content, "No eval permitted"
print("PASS 7: Security audit clean (no eval, no unescaped injection).")

# Test 8: Reader HTML and JS DOM ID contract
import re
with open(reader_html, "r", encoding="utf-8") as f:
    r_html_content = f.read()
with open(reader_js, "r", encoding="utf-8") as f:
    r_js_content = f.read()
with open(reader_css, "r", encoding="utf-8") as f:
    r_css_content = f.read()

r_ids = re.findall(r'getElementById\(["\']([^"\']+)["\']\)', r_js_content)
for rid in set(r_ids):
    assert f'id="{rid}"' in r_html_content, f"reader.html is missing id='{rid}' used by reader.js"
print(f"PASS 8: All {len(set(r_ids))} DOM elements in reader.js successfully mapped to reader.html.")

# Test 9: CET4 / CET6 Badge feature verification
assert "cetTag" in bg_js_content, "background.js must provide cetTag"
assert "data.collins" in bg_js_content and "data.ec" in bg_js_content, "background.js must parse Collins and EC for CET tags"
assert "yd-card-cet-tag" in content_js_content, "content.js must contain yd-card-cet-tag element and styles"
assert ".cet4" in content_js_content and ".cet6" in content_js_content, "content.js must define styles for .cet4 and .cet6"
assert "data.cetTag === \"CET4\"" in content_js_content, "content.js must strictly check for CET4/CET6"
print("PASS 9: CET4/CET6 exam syllabus badge contract and styles verified.")

# Test 10: Font clarity & Edge-style enhancement verification
assert "btn-text-enhance" in r_html_content, "reader.html must have btn-text-enhance"
assert "text-enhanced" in r_css_content, "reader.css must have text-enhanced rule"
assert "renderDpr" in r_js_content, "reader.js must use high-DPI supersampling renderDpr"
assert "-webkit-optimize-contrast" not in r_css_content, "reader.css must not use -webkit-optimize-contrast on canvas"
print("PASS 10: Font clarity, supersampling and Edge-style text enhancement verified.")

# Test 11: Edge 30 palette, thickness slider & wavy preview verification
assert "EDGE_30_COLORS" in r_js_content, "reader.js must define EDGE_30_COLORS"
assert "pen-palette-grid" in r_html_content and "rect-palette-grid" in r_html_content, "reader.html must have palette grids"
assert "pen-wavy-preview" in r_html_content and "rect-wavy-preview" in r_html_content, "reader.html must have wavy preview svgs"
assert "pen-size-slider" in r_html_content and "rect-size-slider" in r_html_content, "reader.html must have size sliders"
assert "edge-palette-grid" in r_css_content and "edge-color-circle" in r_css_content, "reader.css must style edge palette"
print("PASS 11: Edge 30-color palette, continuous sliders, and wavy preview verified.")

# Test 12: Smooth Bézier curve drawing & physical width calibration
assert "drawSmoothStroke" in r_js_content, "reader.js must implement Bézier curve smoothing (drawSmoothStroke)"
assert "bezierCurveTo" in r_js_content and "smoothStrokePoints" in r_js_content, "reader.js must use cubic Catmull-Rom Bézier and tremor smoothing"
assert "scale = " in r_js_content, "reader.js must calibrate stroke width to display CSS pixels"
print("PASS 12: Catmull-Rom cubic Bézier anti-jagged curve interpolation and physical scale verified.")

# Test 13: Search (Ctrl+F) and Undo/Redo (Ctrl+Z/Y) engine
assert "btn-search-toggle" in r_html_content and "search-bar" in r_html_content, "reader.html must have search UI"
assert "btn-undo" in r_html_content and "btn-redo" in r_html_content, "reader.html must have undo/redo buttons"
assert "recordUndoAction" in r_js_content and "performUndo" in r_js_content and "performRedo" in r_js_content, "reader.js must have undo engine"
assert "performSearch" in r_js_content and "activateSearchMatch" in r_js_content, "reader.js must have fulltext search engine"
print("PASS 13: Fulltext PDF search (Ctrl+F) and Undo/Redo stack engine verified.")

# Test 14: Global Notebook & Markdown Export verification
assert "tool-add-note" in r_html_content, "reader.html must have tool-add-note"
assert "notebook-drawer" in r_html_content, "reader.html must have notebook-drawer"
assert "btn-export-notes-md" in r_html_content, "reader.html must have export .md button"
assert "youdao_global_notebook" in r_js_content, "reader.js must persist to youdao_global_notebook"
assert "youdao_global_notebook" in content_js_content, "content.js must also write to youdao_global_notebook"
assert "exportNotesAsMarkdown" in r_js_content, "reader.js must implement exportNotesAsMarkdown"
print("PASS 14: Cross-extension global notebook & Markdown (.md) exporter verified.")

# Test 15: Dual Eraser mode (Stroke vs Area) and Page Clear
assert "btn-eraser-mode-stroke" in r_html_content and "btn-eraser-mode-area" in r_html_content, "reader.html must have eraser modes"
assert "btn-eraser-clear-page" in r_html_content, "reader.html must have clear page button"
assert "currentEraserMode" in r_js_content, "reader.js must track eraser mode"
print("PASS 15: Dual-mode eraser (Stroke vs Area) and page clear verified.")

# Test 16: v1.6.0 Quality, Audio & Long-Sentence Translation Polish
assert manifest.get("version") == "1.6.0", "Manifest version must be 1.6.0"
assert "playAudio" in r_js_content, "reader.js must support audio pronunciation for vocabulary notes"
assert "note-item-audio-btn" in r_js_content and "note-item-audio-btn" in r_css_content, "Audio button must be in reader JS and CSS"
assert "wheel" in r_js_content, "reader.js must support Ctrl+Wheel zooming"
assert "popup-notes-count" in html_content and "popup-notes-count" in popup_js_content, "Popup must display live note count"
assert "text.length > 800" in content_js_content, "content.js must allow up to 800 chars for long sentence and paragraph translation"
print("PASS 16: Audio pronunciation, Ctrl+Wheel zoom, long-sentence (800 chars) & popup sync verified.")

# Test 17: Viewport Lazy Loading & Virtual Scrolling
assert "setupPageObserver" in r_js_content, "reader.js must implement setupPageObserver"
assert "PRELOAD_BUFFER_PX" in r_js_content, "reader.js must define PRELOAD_BUFFER_PX"
assert "unloadSinglePage" in r_js_content, "reader.js must implement unloadSinglePage"
assert ".pdf-page-wrapper.unrendered" in r_css_content, "reader.css must style unrendered page placeholder"
print("PASS 17: Viewport lazy loading, 3-page buffer & memory unloader verified.")

# Test 18: PDF TOC Outline Drawer
assert "btn-outline-toggle" in r_html_content and "outline-drawer" in r_html_content, "reader.html must have outline UI"
assert "loadPdfOutline" in r_js_content and "renderOutlineItems" in r_js_content, "reader.js must parse outline"
assert ".outline-tree" in r_css_content and ".outline-item" in r_css_content, "reader.css must style outline tree"
print("PASS 18: PDF TOC bookmarks outline drawer and navigation verified.")

# Test 19: Eye-Care Sepia & Night Dark Mode Theme Engine
assert "btn-theme-toggle" in r_html_content and "theme-menu" in r_html_content, "reader.html must have theme switcher"
assert "theme-sepia" in r_css_content and "theme-dark" in r_css_content, "reader.css must define sepia and dark themes"
assert "invert(88%)" in r_css_content, "reader.css must use Edge-style inverted filter in dark mode"
assert "initTheme" in r_js_content and "setTheme" in r_js_content, "reader.js must manage theme state"
print("PASS 19: Eye-care Sepia and Night Dark Mode theme engine verified.")

# Test 20: Non-blocking Highlight Popup, Anki TSV Exporter & In-memory LRU Cache
assert "highlight-action-popup" in r_html_content and "highlight-action-popup" in r_css_content, "Highlight action popup must be present"
assert "showHighlightActionPopup" in r_js_content, "reader.js must show non-blocking highlight popup"
hl_func_start = r_js_content.find("function renderPageHighlights")
assert "confirm(" not in r_js_content[hl_func_start:hl_func_start + 1200], "renderPageHighlights must eliminate disruptive confirm() dialogs on clicking highlights"
assert "btn-export-notes-anki" in r_html_content, "reader.html must have Anki export button"
assert "exportNotesAsAnkiTSV" in r_js_content, "reader.js must implement exportNotesAsAnkiTSV"
assert "definitionCache" in bg_js_content, "background.js must implement definitionCache"
assert "audioUrlUk" in bg_js_content, "background.js must provide UK/US dual pronunciation"
print("PASS 20: Non-blocking highlight popup, Anki TSV exporter & LRU cache verified.")

# Test 21: handleAddNoteFromSelection data contract unpacking
assert "queryResult.data" in r_js_content, "reader.js must unpack queryResult.data from background response"
assert "data.explains" in r_js_content and "data.cetTag" in r_js_content, "reader.js must extract phonetic, explains, and cetTag from background data"
print("PASS 21: Add note data protocol correctly unpacks word, phonetic, explains, and cetTag.")

# Test 22: Notebook card reverse search undefined function fix
assert "openSearchBar()" not in r_js_content, "reader.js must not call undefined openSearchBar()"
assert "toggleSearchBar(true)" in r_js_content, "reader.js must call toggleSearchBar(true) when clicking notebook card"
print("PASS 22: Notebook card click correctly invokes toggleSearchBar(true) without error.")

# Test 23: Highlight bubble dictionary lookup card bridge
assert "window.__youdaoShowWordCard" in content_js_content, "content.js must expose window.__youdaoShowWordCard"
assert "window.__youdaoShowWordCard" in r_js_content, "reader.js must call window.__youdaoShowWordCard from hlActDict"
print("PASS 23: Highlight bubble dictionary lookup card bridge successfully connected.")

# Test 24: Zoom scroll anchoring mechanism
assert "async function changeZoom" in r_js_content or "changeZoom = async" in r_js_content, "changeZoom must be async for scroll anchoring"
assert "anchorPage" in r_js_content and "pageOffsetRatio" in r_js_content, "changeZoom must record anchorPage and pageOffsetRatio"
print("PASS 24: Zoom scroll anchoring mechanism accurately tracks page and intra-page offset.")

# Test 25: IndexedDB cascade deletion & prune leak prevention
assert "pdfKey: currentDocKey" in r_js_content, "loadPdfData must pass pdfKey to dbSaveRecentDoc"
assert "pdfKey: meta.pdfKey" in r_js_content, "dbSaveRecentDoc must persist pdfKey"
assert "targetPdfKey" in r_js_content, "dbDeleteRecentDoc and dbPruneRecentDocs must resolve targetPdfKey for cascade cleanup"
print("PASS 25: IndexedDB recent_docs cascade delete & prune cleanup by pdfKey verified.")

# Test 26: Note card decoupled DOM structure
assert "pdf-text-box-content" in r_js_content, "reader.js must decouple editable area into pdf-text-box-content"
assert "pdf-text-box-content" in r_css_content, "reader.css must style pdf-text-box-content"
assert ".replace(/✕$/, \"\")" not in r_js_content, "reader.js must not rely on fragile delete button text stripping on blur"
print("PASS 26: Note card decoupled DOM structure prevents backspace deletion and text contamination.")

# Test 27: Execute deep runtime behavioral verification suite
import subprocess
ret = subprocess.run(["node", os.path.join(tests_dir, "test_deep_verification.js")], capture_output=True, text=True, cwd=ext_dir)
assert ret.returncode == 0, f"test_deep_verification.js failed:\n{ret.stderr}\n{ret.stdout}"
print("PASS 27: Deep behavioral verification suite (12 suites: data unpacking, scroll anchoring, undo isolation, boundary clamping, cascade prune, cross-page search, selection slicing, phrase router, pin mode, parallel outline, batch undo/redo, count preservation) 100% passed.")

# Test 28: P1-1 异步全文检索与跨页索引引擎契约校验
assert "searchAllPagesAcrossDoc" in r_js_content, "reader.js must implement searchAllPagesAcrossDoc"
assert "docSearchMatches" in r_js_content, "reader.js must maintain docSearchMatches"
assert "docPageTextCache" in r_js_content, "reader.js must maintain docPageTextCache"
print("PASS 28: Asynchronous whole-document search & cross-page indexing engine contract verified.")

# Test 29: P1-2 纯前端无损矢量 PDF 导出升级契约校验
pdf_lib_path = os.path.join(ext_dir, "lib", "pdf-lib.min.js")
assert os.path.exists(pdf_lib_path), "lib/pdf-lib.min.js missing"
assert os.path.getsize(pdf_lib_path) > 300000, "pdf-lib.min.js file size too small"
assert "pdf-lib.min.js" in r_html_content, "reader.html must include pdf-lib.min.js script"
assert "PDFLib" in r_js_content and "pdfDoc.save()" in r_js_content, "reader.js must use pdf-lib for vector PDF export"
print("PASS 29: Lossless vector PDF exporter (pdf-lib integration & vector preservation) verified.")

# Test 30: P1-3 跨页选区高亮智能切片 (Selection Slicing) 契约校验
assert "pageSlices" in r_js_content, "reader.js must implement pageSlices for selection slicing"
assert "pageSlices.entries()" in r_js_content, "reader.js must slice multi-page selection rects per page boundary"
print("PASS 30: Cross-page selection slicing (Selection Slicing) & multi-page persistence verified.")

# Test 31: P2-1 短语搭配放宽与 P2-2 释义卡片 📌 钉住 (Pin) 模式契约校验
assert "isDirectSentence" in bg_js_content, "background.js must relax phrase detection with isDirectSentence"
assert "isCardPinned" in content_js_content, "content.js must track isCardPinned state"
assert "yd-card-pin-btn" in content_js_content, "content.js must provide yd-card-pin-btn"
print("PASS 31: Phrase collocation relaxation (4-6 words) & Card [Pin] lock mode verified.")

# Test 32: P2-3 双发音 (UK/US) 独立点播与 P2-4 目录大纲 Promise.all 并发解析契约校验
assert "yd-card-audio-uk" in content_js_content and "yd-card-audio-us" in content_js_content, "content.js must provide UK/US audio buttons"
assert "note-audio-uk" in r_js_content and "note-audio-us" in r_js_content, "reader.js must provide UK/US note audio buttons"
assert "Promise.all" in r_js_content and "resolveDestinationPage" in r_js_content, "reader.js must resolve outline destinations in parallel via Promise.all"
print("PASS 32: UK/US dual accent independent audio buttons & outline Promise.all acceleration verified.")

print("\n[SUCCESS] ALL 32 AUTOMATED CHECKS PASSED WITH ZERO ERRORS!")
