/**
 * 元素选择器 + 取色器模块
 * 直接操作 iframe contentDocument（同源 iframe）
 */

import { copyText } from './clipboard';

// ==================== Element Picker ====================

const pickerHandlers = {
  mouseOver(e) { e.target.classList.add('picker-hover'); },
  mouseOut(e) { e.target.classList.remove('picker-hover'); },
  click: null, // 由 enable() 动态绑定
};

let pickerSelectedElement = null;

function injectPickerStyles(doc) {
  if (doc.getElementById('picker-style')) return;
  const style = doc.createElement('style');
  style.id = 'picker-style';
  style.textContent = `
    .picker-hover { outline: 2px solid #6366f1 !important; outline-offset: 2px; cursor: crosshair !important; }
    .picker-selected { outline: 2px solid #22c55e !important; outline-offset: 2px; }
    .color-picker-hover { outline: 2px dashed #ec4899 !important; outline-offset: 2px; cursor: crosshair !important; }
    .element-highlight {
      outline: 3px solid #22c55e !important; outline-offset: 2px;
      animation: highlight-pulse 0.5s ease-in-out 3;
    }
    @keyframes highlight-pulse { 0%,100%{outline-color:#22c55e} 50%{outline-color:#86efac} }
  `;
  doc.head.appendChild(style);
}

const INTERNAL_PICKER_CLASSES = new Set([
  'picker-hover', 'picker-selected', 'color-picker-hover', 'element-highlight',
]);

function generateSelector(el) {
  if (el.id) return `#${el.id}`;
  if (el.className && typeof el.className === 'string') {
    const classes = el.className
      .split(' ')
      .filter(Boolean)
      .filter((c) => !INTERNAL_PICKER_CLASSES.has(c))
      .slice(0, 2);
    if (classes.length) return `.${classes.join('.')}`;
  }
  return el.tagName.toLowerCase();
}

function guessEventType(el) {
  const tag = el.tagName.toLowerCase();
  const cls = (typeof el.className === 'string' ? el.className : '').toLowerCase();
  if (tag === 'button' || cls.includes('btn')) return 'tap';
  if (tag === 'a' || cls.includes('link')) return 'tap';
  if (tag === 'input' || tag === 'textarea') return 'input';
  return 'tap';
}

export const Picker = {
  enable(iframe, onElementClick) {
    const doc = iframe.contentDocument;
    if (!doc) return;
    injectPickerStyles(doc);
    doc.body.style.cursor = 'crosshair';

    const handleClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const el = e.target;
      pickerSelectedElement = el;
      const selector = generateSelector(el);
      const eventType = guessEventType(el);
      if (onElementClick) onElementClick(selector, eventType, e);
    };

    pickerHandlers.click = handleClick;
    doc.addEventListener('mouseover', pickerHandlers.mouseOver);
    doc.addEventListener('mouseout', pickerHandlers.mouseOut);
    doc.addEventListener('click', handleClick);
  },

  disable(iframe) {
    const doc = iframe?.contentDocument;
    if (!doc) return;
    doc.body.style.cursor = '';
    doc.querySelectorAll('.picker-hover').forEach(el => el.classList.remove('picker-hover'));
    doc.removeEventListener('mouseover', pickerHandlers.mouseOver);
    doc.removeEventListener('mouseout', pickerHandlers.mouseOut);
    if (pickerHandlers.click) {
      doc.removeEventListener('click', pickerHandlers.click);
      pickerHandlers.click = null;
    }
  },

  get selectedElement() { return pickerSelectedElement; },
};

// ==================== Color Picker ====================

let colorTooltip = null;
let colorCanvas = null;
let colorCtx = null;
let colorClickHandler = null;
let colorMoveHandler = null;
let colorLeaveHandler = null;

function createColorTooltip() {
  if (colorTooltip) return;
  colorTooltip = document.createElement('div');
  colorTooltip.id = 'colorPickerTooltip';
  colorTooltip.style.cssText = `
    position:fixed; z-index:10000; pointer-events:none; display:none;
    background:var(--bg-secondary); border:1px solid var(--border); border-radius:8px;
    padding:8px 12px; box-shadow:0 4px 12px rgba(0,0,0,0.3);
    font-family:'JetBrains Mono',monospace; font-size:12px;
  `;
  colorTooltip.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;">
      <div id="colorPreviewSwatch" style="width:32px;height:32px;border-radius:6px;border:2px solid rgba(255,255,255,0.2);"></div>
      <div>
        <div id="colorPreviewHex" style="font-weight:600;color:var(--text);"></div>
        <div id="colorPreviewRgb" style="font-size:10px;color:var(--text-muted);margin-top:2px;"></div>
      </div>
    </div>`;
  document.body.appendChild(colorTooltip);
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => { const h = x.toString(16); return h.length === 1 ? '0' + h : h; }).join('').toLowerCase();
}

function parseRgba(value) {
  if (!value) return null;
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const match = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (match) return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]), a: match[4] !== undefined ? parseFloat(match[4]) : 1 };
  return null;
}

function getColorFromElement(el, e) {
  if (!el || !el.ownerDocument) return { r: 128, g: 128, b: 128, hex: '#808080' };
  const doc = el.ownerDocument;
  const elementsAtPoint = doc.elementsFromPoint(e.clientX, e.clientY);

  for (const currentEl of elementsAtPoint) {
    if (!currentEl || currentEl === doc.documentElement || currentEl === doc.body) continue;
    if (currentEl.tagName === 'IMG') {
      const imgColor = getColorFromImage(currentEl, e);
      if (imgColor) return imgColor;
    }
    const style = doc.defaultView.getComputedStyle(currentEl);
    const bgColorValue = style.backgroundColor;
    const bgRgb = parseRgba(bgColorValue);
    if (bgRgb) {
      if (bgRgb.a === 0) continue;
      if (bgRgb.a < 1) continue;
      return { r: bgRgb.r, g: bgRgb.g, b: bgRgb.b, hex: rgbToHex(bgRgb.r, bgRgb.g, bgRgb.b) };
    }
  }
  // Second pass: accept semi-transparent
  for (const currentEl of elementsAtPoint) {
    if (!currentEl || currentEl === doc.documentElement || currentEl === doc.body) continue;
    const style = doc.defaultView.getComputedStyle(currentEl);
    const bgRgb = parseRgba(style.backgroundColor);
    if (bgRgb && bgRgb.a > 0) return { r: bgRgb.r, g: bgRgb.g, b: bgRgb.b, hex: rgbToHex(bgRgb.r, bgRgb.g, bgRgb.b) };
  }
  // Fallback: text color / border
  const style = doc.defaultView.getComputedStyle(el);
  for (const colorValue of [style.color, style.borderColor, style.outlineColor]) {
    const rgb = parseRgba(colorValue);
    if (rgb && rgb.a > 0) return { r: rgb.r, g: rgb.g, b: rgb.b, hex: rgbToHex(rgb.r, rgb.g, rgb.b) };
  }
  return { r: 128, g: 128, b: 128, hex: '#808080' };
}

function getColorFromImage(img, e) {
  try {
    if (!img.complete || !img.naturalWidth) return null;
    if (!colorCanvas) { colorCanvas = document.createElement('canvas'); colorCtx = colorCanvas.getContext('2d', { willReadFrequently: true }); }
    const rect = img.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const scaleX = img.naturalWidth / rect.width, scaleY = img.naturalHeight / rect.height;
    const imgX = Math.floor(x * scaleX), imgY = Math.floor(y * scaleY);
    if (imgX < 0 || imgX >= img.naturalWidth || imgY < 0 || imgY >= img.naturalHeight) return null;
    colorCanvas.width = img.naturalWidth; colorCanvas.height = img.naturalHeight;
    colorCtx.drawImage(img, 0, 0);
    const pixel = colorCtx.getImageData(imgX, imgY, 1, 1).data;
    if (pixel[3] === 0) return null;
    return { r: pixel[0], g: pixel[1], b: pixel[2], hex: rgbToHex(pixel[0], pixel[1], pixel[2]) };
  } catch { return null; }
}

// 当前绑定的目标（iframe 或 { doc, container }）
let colorBoundTarget = null;

function getColorTargetInfo() {
  if (!colorBoundTarget) return null;
  if (colorBoundTarget.iframe) {
    const iframe = colorBoundTarget.iframe;
    const iframeRect = iframe.getBoundingClientRect();
    const zoom = iframeRect.width / iframe.offsetWidth || 1;
    return { doc: iframe.contentDocument, iframeRect, zoom };
  }
  // 主文档模式
  return { doc: colorBoundTarget.doc, iframeRect: null, zoom: 1 };
}

export const ColorPickerModule = {
  /**
   * 启用取色器
   * @param {HTMLIFrameElement|null} iframe - iframe 元素，传 null 则绑定主文档
   * @param {Function} onColorPicked - 选中颜色回调
   * @param {Object} [options] - 额外选项
   * @param {HTMLElement} [options.container] - 限定取色区域的容器元素（主文档模式下）
   */
  enable(iframe, onColorPicked, options = {}) {
    const doc = iframe ? iframe.contentDocument : document;
    if (!doc) return;

    // 先禁用之前的绑定
    if (colorBoundTarget) this.disable();

    createColorTooltip();
    if (!colorCanvas) { colorCanvas = document.createElement('canvas'); colorCtx = colorCanvas.getContext('2d', { willReadFrequently: true }); }

    colorBoundTarget = iframe ? { iframe } : { doc, container: options.container || null };

    // 只在容器内设置十字光标，而非整个 body
    if (colorBoundTarget.container) {
      colorBoundTarget.container.style.cursor = 'crosshair';
    } else if (doc.body) {
      doc.body.style.cursor = 'crosshair';
    }

    // 检查事件是否在容器内（主文档模式）
    const isInsideContainer = (e) => {
      const c = colorBoundTarget?.container;
      if (!c) return true; // iframe 模式或无容器，始终允许
      const rect = c.getBoundingClientRect();
      return e.clientX >= rect.left && e.clientX <= rect.right &&
             e.clientY >= rect.top && e.clientY <= rect.bottom;
    };

    colorMoveHandler = (e) => {
      // 主文档模式下，检查是否在容器内
      if (!colorBoundTarget?.iframe && colorBoundTarget?.container) {
        if (!isInsideContainer(e)) {
          if (colorTooltip) colorTooltip.style.display = 'none';
          return;
        }
      }
      const el = e.target;
      const color = getColorFromElement(el, e);
      if (!colorTooltip || !color) return;
      const info = getColorTargetInfo();
      let tooltipX, tooltipY;
      if (info.iframeRect) {
        tooltipX = info.iframeRect.left + e.clientX * info.zoom + 20;
        tooltipY = info.iframeRect.top + e.clientY * info.zoom + 20;
      } else {
        tooltipX = e.clientX + 20;
        tooltipY = e.clientY + 20;
      }
      const maxX = window.innerWidth - 150, maxY = window.innerHeight - 80;
      colorTooltip.style.display = 'block';
      colorTooltip.style.left = Math.min(tooltipX, maxX) + 'px';
      colorTooltip.style.top = Math.min(tooltipY, maxY) + 'px';
      const swatch = document.getElementById('colorPreviewSwatch');
      const hexText = document.getElementById('colorPreviewHex');
      const rgbText = document.getElementById('colorPreviewRgb');
      if (swatch) swatch.style.background = color.hex;
      if (hexText) hexText.textContent = color.hex;
      if (rgbText) rgbText.textContent = `RGB(${color.r}, ${color.g}, ${color.b})`;
    };

    colorClickHandler = (e) => {
      // 主文档模式下，忽略容器外的点击
      if (!colorBoundTarget?.iframe && colorBoundTarget?.container) {
        if (!isInsideContainer(e)) return;
      }
      e.preventDefault();
      e.stopPropagation();
      const color = getColorFromElement(e.target, e);
      if (color && color.hex !== '#808080') {
        // iframe 模式下，点击发生在 iframe 文档里，主文档失焦会导致
        // navigator.clipboard.writeText 静默 reject。先 focus 主窗口，
        // 再 await，并准备 execCommand 兜底。
        copyText(color.hex).then((ok) => {
          if (onColorPicked) onColorPicked(color.hex, ok);
        });
      }
    };

    colorLeaveHandler = () => {
      if (colorTooltip) colorTooltip.style.display = 'none';
    };

    doc.addEventListener('mousemove', colorMoveHandler);
    doc.addEventListener('click', colorClickHandler);
    doc.addEventListener('mouseleave', colorLeaveHandler);
  },

  disable(iframe) {
    let doc;
    if (colorBoundTarget) {
      doc = colorBoundTarget.iframe ? colorBoundTarget.iframe.contentDocument : colorBoundTarget.doc;
    } else if (iframe) {
      doc = iframe.contentDocument;
    }
    if (doc) {
      // 恢复光标
      if (colorBoundTarget?.container) {
        colorBoundTarget.container.style.cursor = '';
      } else if (doc.body) {
        doc.body.style.cursor = '';
      }
      if (colorMoveHandler) doc.removeEventListener('mousemove', colorMoveHandler);
      if (colorClickHandler) doc.removeEventListener('click', colorClickHandler);
      if (colorLeaveHandler) doc.removeEventListener('mouseleave', colorLeaveHandler);
    }
    if (colorTooltip) colorTooltip.style.display = 'none';
    colorMoveHandler = null;
    colorClickHandler = null;
    colorLeaveHandler = null;
    colorBoundTarget = null;
  },

  /** 是否绑定在 iframe 上 */
  get isIframeBound() {
    return colorBoundTarget?.iframe != null;
  },
};

// ==================== 高亮定位元素 ====================

/**
 * 在 iframe 中高亮指定选择器的元素
 * @param {HTMLIFrameElement} iframe
 * @param {string} selector - CSS 选择器
 */
export function highlightElement(iframe, selector) {
  if (!selector || !iframe?.contentDocument) return false;
  const doc = iframe.contentDocument;

  // 清除之前的高亮
  doc.querySelectorAll('.element-highlight').forEach(el => el.classList.remove('element-highlight'));

  // 兼容历史数据：剥离误存入选择器的内部 picker 类
  const cleanedSelector = selector.replace(
    /\.(picker-hover|picker-selected|color-picker-hover|element-highlight)(?![\w-])/g,
    ''
  ).trim();
  if (!cleanedSelector) return false;

  try {
    let el;
    if (cleanedSelector.startsWith('#')) {
      const id = cleanedSelector.slice(1);
      el = doc.querySelector(`[id="${id}"]`);
    } else {
      el = doc.querySelector(cleanedSelector);
    }
    if (el) {
      // 注入高亮样式（如果尚未注入）
      injectPickerStyles(doc);
      el.classList.add('element-highlight');
      // 仅当预览内容可滚动时才滚动，避免触发父页面滚动
      const scrollEl = doc.scrollingElement || doc.documentElement;
      if (scrollEl && scrollEl.scrollHeight > scrollEl.clientHeight + 1) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setTimeout(() => el.classList.remove('element-highlight'), 3000);
      return true;
    }
  } catch (e) {
    console.warn('highlightElement failed:', e.message);
  }
  return false;
}

/**
 * 同时高亮多个元素（不滚动）。
 * @param {HTMLIFrameElement} iframe
 * @param {string[]} selectors
 * @returns {number} 实际高亮成功的元素数量
 */
export function highlightElements(iframe, selectors) {
  if (!iframe?.contentDocument || !Array.isArray(selectors)) return 0;
  const doc = iframe.contentDocument;
  doc.querySelectorAll('.element-highlight').forEach(el => el.classList.remove('element-highlight'));
  injectPickerStyles(doc);
  const highlighted = [];
  for (const sel of selectors) {
    if (!sel) continue;
    const cleaned = String(sel).replace(
      /\.(picker-hover|picker-selected|color-picker-hover|element-highlight)(?![\w-])/g,
      ''
    ).trim();
    if (!cleaned) continue;
    try {
      const el = cleaned.startsWith('#')
        ? doc.querySelector(`[id="${cleaned.slice(1)}"]`)
        : doc.querySelector(cleaned);
      if (el) {
        el.classList.add('element-highlight');
        highlighted.push(el);
      }
    } catch (e) { /* ignore invalid selector */ }
  }
  if (highlighted.length > 0) {
    setTimeout(() => {
      highlighted.forEach(el => el.classList.remove('element-highlight'));
    }, 3000);
  }
  return highlighted.length;
}
