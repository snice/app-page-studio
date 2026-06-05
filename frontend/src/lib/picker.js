/**
 * 元素选择器 + 取色器模块
 * 直接操作 iframe contentDocument（同源 iframe）
 */

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

function generateSelector(el) {
  if (el.id) return `#${el.id}`;
  if (el.className && typeof el.className === 'string') {
    const classes = el.className.split(' ').filter(Boolean).slice(0, 2);
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

export const ColorPickerModule = {
  enable(iframe, onColorPicked) {
    const doc = iframe.contentDocument;
    if (!doc) return;
    createColorTooltip();
    if (!colorCanvas) { colorCanvas = document.createElement('canvas'); colorCtx = colorCanvas.getContext('2d', { willReadFrequently: true }); }

    doc.body.style.cursor = 'crosshair';

    colorMoveHandler = (e) => {
      const el = e.target;
      const color = getColorFromElement(el, e);
      if (!colorTooltip || !color) return;
      const iframeRect = iframe.getBoundingClientRect();
      const zoom = iframeRect.width / iframe.offsetWidth || 1;
      const tooltipX = iframeRect.left + e.clientX * zoom + 20;
      const tooltipY = iframeRect.top + e.clientY * zoom + 20;
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
      e.preventDefault();
      e.stopPropagation();
      const color = getColorFromElement(e.target, e);
      if (color && color.hex !== '#808080') {
        if (navigator.clipboard) navigator.clipboard.writeText(color.hex);
        if (onColorPicked) onColorPicked(color.hex);
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
    const doc = iframe?.contentDocument;
    if (doc) {
      doc.body.style.cursor = '';
      if (colorMoveHandler) doc.removeEventListener('mousemove', colorMoveHandler);
      if (colorClickHandler) doc.removeEventListener('click', colorClickHandler);
      if (colorLeaveHandler) doc.removeEventListener('mouseleave', colorLeaveHandler);
    }
    if (colorTooltip) colorTooltip.style.display = 'none';
    colorMoveHandler = null;
    colorClickHandler = null;
    colorLeaveHandler = null;
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

  try {
    let el;
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      el = doc.querySelector(`[id="${id}"]`);
    } else {
      el = doc.querySelector(selector);
    }
    if (el) {
      // 注入高亮样式（如果尚未注入）
      injectPickerStyles(doc);
      el.classList.add('element-highlight');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => el.classList.remove('element-highlight'), 3000);
      return true;
    }
  } catch (e) {
    console.warn('highlightElement failed:', e.message);
  }
  return false;
}
