/**
 * 元素选择器模块
 * 处理 iframe 内元素的选取
 */

const Picker = {
  /**
   * 设置元素选择器
   * @param {HTMLIFrameElement} iframe - iframe 元素
   */
  setup(iframe) {
    const doc = iframe.contentDocument;
    if (!doc) return;

    // 注入样式
    const style = doc.createElement('style');
    style.id = 'picker-style';
    style.textContent = `
      .picker-hover { outline: 2px solid #6366f1 !important; outline-offset: 2px; cursor: crosshair !important; }
      .picker-selected { outline: 2px solid #22c55e !important; outline-offset: 2px; }
      .color-picker-hover { outline: 2px dashed #ec4899 !important; outline-offset: 2px; cursor: crosshair !important; }
      .element-highlight {
        outline: 3px solid #22c55e !important;
        outline-offset: 2px;
        animation: highlight-pulse 0.5s ease-in-out 3;
      }
      @keyframes highlight-pulse {
        0%, 100% { outline-color: #22c55e; }
        50% { outline-color: #86efac; }
      }
    `;
    doc.head.appendChild(style);
  },

  /**
   * 启用选择器
   * @param {HTMLIFrameElement} iframe - iframe 元素
   */
  enable(iframe) {
    const doc = iframe.contentDocument;
    if (!doc) return;

    doc.body.style.cursor = 'crosshair';
    doc.addEventListener('mouseover', this.handleMouseOver);
    doc.addEventListener('mouseout', this.handleMouseOut);
    doc.addEventListener('click', this.handleClick);
  },

  /**
   * 禁用选择器
   * @param {HTMLIFrameElement} iframe - iframe 元素
   */
  disable(iframe) {
    const doc = iframe.contentDocument;
    if (!doc) return;

    doc.body.style.cursor = '';
    doc.querySelectorAll('.picker-hover').forEach(el => el.classList.remove('picker-hover'));
    doc.removeEventListener('mouseover', this.handleMouseOver);
    doc.removeEventListener('mouseout', this.handleMouseOut);
    doc.removeEventListener('click', this.handleClick);
  },

  handleMouseOver(e) {
    e.target.classList.add('picker-hover');
  },

  handleMouseOut(e) {
    e.target.classList.remove('picker-hover');
  },

  handleClick(e) {
    e.preventDefault();
    e.stopPropagation();

    const el = e.target;
    const selector = Picker.generateSelector(el);
    const type = Picker.guessType(el);

    // 显示选择菜单
    showPickerActionMenu(e, selector, type);
  },

  /**
   * 生成元素选择器
   * @param {HTMLElement} el - DOM 元素
   * @returns {string} CSS 选择器
   */
  generateSelector(el) {
    if (el.id) return `#${el.id}`;
    if (el.className) {
      const classes = el.className.split(' ').filter(Boolean).slice(0, 2);
      if (classes.length) return `.${classes.join('.')}`;
    }
    return el.tagName.toLowerCase();
  },

  /**
   * 猜测元素交互类型
   * @param {HTMLElement} el - DOM 元素
   * @returns {string} 交互类型
   */
  guessType(el) {
    const tag = el.tagName.toLowerCase();
    const cls = (el.className || '').toLowerCase();

    if (tag === 'button' || cls.includes('btn')) return 'tap';
    if (tag === 'a' || cls.includes('link')) return 'tap';
    if (tag === 'input' || tag === 'textarea') return 'input';
    if (cls.includes('tab')) return 'tap';
    return 'tap';
  }
};

/**
 * 像素取色器模块
 * 从 iframe 内元素获取颜色，支持图片取色
 */
const ColorPicker = {
  iframe: null,
  tooltip: null,
  isActive: false,
  imageCanvas: null,
  imageCtx: null,
  bgImageCache: new Map(), // 缓存已加载的背景图片

  /**
   * 启用取色器
   * @param {HTMLIFrameElement} iframe - iframe 元素
   */
  enable(iframe) {
    this.iframe = iframe;
    this.isActive = true;

    // 创建用于图片取色的 canvas
    this.imageCanvas = document.createElement('canvas');
    this.imageCtx = this.imageCanvas.getContext('2d', { willReadFrequently: true });

    // 创建颜色预览 tooltip
    this.createTooltip();

    // 在 iframe 内添加事件监听
    const doc = iframe.contentDocument;
    if (doc) {
      doc.body.style.cursor = 'crosshair';
      doc.addEventListener('mousemove', this.handleIframeMouseMove);
      doc.addEventListener('click', this.handleIframeClick);
      doc.addEventListener('mouseleave', this.handleMouseLeave);
    }
  },

  /**
   * 禁用取色器
   */
  disable() {
    this.isActive = false;

    // 移除 iframe 内的事件监听
    if (this.iframe && this.iframe.contentDocument) {
      const doc = this.iframe.contentDocument;
      doc.body.style.cursor = '';
      doc.removeEventListener('mousemove', this.handleIframeMouseMove);
      doc.removeEventListener('click', this.handleIframeClick);
      doc.removeEventListener('mouseleave', this.handleMouseLeave);
    }

    // 移除 tooltip
    if (this.tooltip && this.tooltip.parentNode) {
      this.tooltip.parentNode.removeChild(this.tooltip);
    }
    this.tooltip = null;
    this.iframe = null;
    this.imageCanvas = null;
    this.imageCtx = null;
    this.bgImageCache.clear(); // 清空背景图片缓存
  },

  /**
   * 创建颜色预览 tooltip
   */
  createTooltip() {
    if (this.tooltip) return;

    this.tooltip = document.createElement('div');
    this.tooltip.id = 'colorPickerTooltip';
    this.tooltip.style.cssText = `
      position: fixed;
      z-index: 10000;
      pointer-events: none;
      display: none;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
    `;
    this.tooltip.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <div id="colorPreviewSwatch" style="width:32px;height:32px;border-radius:6px;border:2px solid rgba(255,255,255,0.2);"></div>
        <div>
          <div id="colorPreviewHex" style="font-weight:600;color:var(--text);"></div>
          <div id="colorPreviewRgb" style="font-size:10px;color:var(--text-muted);margin-top:2px;"></div>
        </div>
      </div>
    `;
    document.body.appendChild(this.tooltip);
  },

  /**
   * iframe 内鼠标移动处理 - 实时显示颜色
   */
  handleIframeMouseMove: function(e) {
    if (!ColorPicker.isActive) return;

    const el = e.target;
    const color = ColorPicker.getColorFromElement(el, e);

    // 计算 tooltip 位置（需要转换到主文档坐标，考虑 iframe 滚动）
    const iframe = ColorPicker.iframe;
    if (!iframe) return;

    const iframeRect = iframe.getBoundingClientRect();
    // e.clientX/Y 是相对于 iframe 视口的，不需要额外处理滚动
    const tooltipX = iframeRect.left + e.clientX + 20;
    const tooltipY = iframeRect.top + e.clientY + 20;

    // 确保 tooltip 不超出屏幕
    const maxX = window.innerWidth - 150;
    const maxY = window.innerHeight - 80;

    // 更新 tooltip
    if (ColorPicker.tooltip && color) {
      ColorPicker.tooltip.style.display = 'block';
      ColorPicker.tooltip.style.left = Math.min(tooltipX, maxX) + 'px';
      ColorPicker.tooltip.style.top = Math.min(tooltipY, maxY) + 'px';

      const swatch = document.getElementById('colorPreviewSwatch');
      const hexText = document.getElementById('colorPreviewHex');
      const rgbText = document.getElementById('colorPreviewRgb');

      if (swatch) swatch.style.background = color.hex;
      if (hexText) hexText.textContent = color.hex;
      if (rgbText) rgbText.textContent = `RGB(${color.r}, ${color.g}, ${color.b})`;
    }
  },

  /**
   * 鼠标离开处理
   */
  handleMouseLeave: function() {
    if (ColorPicker.tooltip) {
      ColorPicker.tooltip.style.display = 'none';
    }
  },

  /**
   * iframe 内点击处理 - 选取颜色
   */
  handleIframeClick: function(e) {
    if (!ColorPicker.isActive) return;

    e.preventDefault();
    e.stopPropagation();

    const el = e.target;
    const color = ColorPicker.getColorFromElement(el, e);

    if (color && color.hex !== '#808080') {
      // 添加到已取颜色列表
      if (!State.pickedColors.includes(color.hex)) {
        State.pickedColors.push(color.hex);
      }

      // 复制到剪贴板
      if (navigator.clipboard) {
        navigator.clipboard.writeText(color.hex);
      }

      showToast(`已复制: ${color.hex}`);
      updatePickedColorsDisplay();
    } else {
      showToast('未检测到有效颜色');
    }
  },

  /**
   * 从元素获取颜色
   * @param {HTMLElement} el - DOM 元素
   * @param {MouseEvent} e - 鼠标事件
   * @returns {Object} 颜色对象 {r, g, b, hex}
   */
  getColorFromElement(el, e) {
    if (!el || !el.ownerDocument) {
      return { r: 128, g: 128, b: 128, hex: '#808080' };
    }

    const doc = el.ownerDocument;

    // 获取鼠标位置下的所有元素（从上到下）
    const elementsAtPoint = doc.elementsFromPoint(e.clientX, e.clientY);

    // 遍历所有叠加的元素，尝试获取颜色
    for (const currentEl of elementsAtPoint) {
      if (!currentEl || currentEl === doc.documentElement || currentEl === doc.body) {
        continue;
      }

      // 如果是图片元素，尝试从图片像素获取颜色
      if (currentEl.tagName === 'IMG') {
        const imgColor = this.getColorFromImage(currentEl, e);
        // 只有非透明像素才返回，透明则继续查找下层
        if (imgColor) return imgColor;
      }

      // 检查是否有背景图片
      const style = doc.defaultView.getComputedStyle(currentEl);
      const bgImage = style.backgroundImage;
      if (bgImage && bgImage !== 'none' && bgImage.startsWith('url(')) {
        const bgColor = this.getColorFromBackgroundImage(currentEl, e, bgImage);
        // 只有非透明像素才返回，透明则继续查找下层
        if (bgColor) return bgColor;
      }

      // 检查背景色
      const bgColorValue = style.backgroundColor;
      const bgRgb = this.parseRgba(bgColorValue);
      if (bgRgb) {
        // 如果是完全透明，继续查找下层
        if (bgRgb.a === 0) continue;
        // 如果是半透明，也继续查找（可能下层有更实的颜色）
        if (bgRgb.a < 1) continue;
        // 不透明的背景色，直接返回
        return {
          r: bgRgb.r,
          g: bgRgb.g,
          b: bgRgb.b,
          hex: this.rgbToHex(bgRgb.r, bgRgb.g, bgRgb.b)
        };
      }
    }

    // 第二轮：如果没找到完全不透明的颜色，接受半透明颜色
    for (const currentEl of elementsAtPoint) {
      if (!currentEl || currentEl === doc.documentElement || currentEl === doc.body) {
        continue;
      }

      const style = doc.defaultView.getComputedStyle(currentEl);
      const bgColorValue = style.backgroundColor;
      const bgRgb = this.parseRgba(bgColorValue);
      if (bgRgb && bgRgb.a > 0) {
        return {
          r: bgRgb.r,
          g: bgRgb.g,
          b: bgRgb.b,
          hex: this.rgbToHex(bgRgb.r, bgRgb.g, bgRgb.b)
        };
      }
    }

    // 如果叠加元素都没有找到颜色，尝试从目标元素的其他颜色属性获取
    const style = doc.defaultView.getComputedStyle(el);
    const colorSources = [
      style.color,
      style.borderColor,
      style.borderTopColor,
      style.outlineColor
    ];

    for (const colorValue of colorSources) {
      if (!colorValue) continue;

      const rgb = this.parseRgba(colorValue);
      if (rgb && rgb.a > 0) {
        return {
          r: rgb.r,
          g: rgb.g,
          b: rgb.b,
          hex: this.rgbToHex(rgb.r, rgb.g, rgb.b)
        };
      }
    }

    // 默认返回
    return { r: 128, g: 128, b: 128, hex: '#808080' };
  },

  /**
   * 从图片元素获取像素颜色
   * @param {HTMLImageElement} img - 图片元素
   * @param {MouseEvent} e - 鼠标事件
   * @returns {Object|null} 颜色对象或 null
   */
  getColorFromImage(img, e) {
    try {
      if (!img.complete || !img.naturalWidth) return null;

      const canvas = this.imageCanvas;
      const ctx = this.imageCtx;
      if (!canvas || !ctx) return null;

      // 获取图片在页面上的位置
      const rect = img.getBoundingClientRect();

      // 计算鼠标在图片上的相对位置
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // 计算图片的缩放比例
      const scaleX = img.naturalWidth / rect.width;
      const scaleY = img.naturalHeight / rect.height;

      // 转换为图片原始坐标
      const imgX = Math.floor(x * scaleX);
      const imgY = Math.floor(y * scaleY);

      // 确保坐标在有效范围内
      if (imgX < 0 || imgX >= img.naturalWidth || imgY < 0 || imgY >= img.naturalHeight) {
        return null;
      }

      // 绘制图片到 canvas
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);

      // 获取像素颜色
      const pixel = ctx.getImageData(imgX, imgY, 1, 1).data;

      // 如果像素完全透明，返回 null
      if (pixel[3] === 0) return null;

      return {
        r: pixel[0],
        g: pixel[1],
        b: pixel[2],
        hex: this.rgbToHex(pixel[0], pixel[1], pixel[2])
      };
    } catch (err) {
      // 跨域图片会报错，忽略
      console.log('Image color extraction failed:', err.message);
      return null;
    }
  },

  /**
   * 从背景图片获取像素颜色
   * @param {HTMLElement} el - 元素
   * @param {MouseEvent} e - 鼠标事件
   * @param {string} bgImage - 背景图片 CSS 值
   * @returns {Object|null} 颜色对象或 null
   */
  getColorFromBackgroundImage(el, e, bgImage) {
    try {
      // 提取 URL
      const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
      if (!urlMatch) return null;

      const url = urlMatch[1];

      // 检查缓存中是否有这个图片
      if (!this.bgImageCache.has(url)) {
        // 异步加载图片到缓存
        this.loadBackgroundImage(url);
        return null;
      }

      const cachedImg = this.bgImageCache.get(url);
      if (!cachedImg || !cachedImg.complete || cachedImg.error) {
        return null;
      }

      const canvas = this.imageCanvas;
      const ctx = this.imageCtx;
      if (!canvas || !ctx) return null;

      // 获取元素在页面上的位置
      const rect = el.getBoundingClientRect();
      const doc = el.ownerDocument;
      const style = doc.defaultView.getComputedStyle(el);

      // 计算鼠标在元素内的相对位置
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // 解析 background-size
      const bgSize = style.backgroundSize;
      let imgDisplayWidth = cachedImg.naturalWidth;
      let imgDisplayHeight = cachedImg.naturalHeight;

      if (bgSize === 'cover') {
        // cover: 图片覆盖整个元素，保持比例
        const scaleX = rect.width / cachedImg.naturalWidth;
        const scaleY = rect.height / cachedImg.naturalHeight;
        const scale = Math.max(scaleX, scaleY);
        imgDisplayWidth = cachedImg.naturalWidth * scale;
        imgDisplayHeight = cachedImg.naturalHeight * scale;
      } else if (bgSize === 'contain') {
        // contain: 图片完整显示在元素内，保持比例
        const scaleX = rect.width / cachedImg.naturalWidth;
        const scaleY = rect.height / cachedImg.naturalHeight;
        const scale = Math.min(scaleX, scaleY);
        imgDisplayWidth = cachedImg.naturalWidth * scale;
        imgDisplayHeight = cachedImg.naturalHeight * scale;
      } else if (bgSize !== 'auto') {
        // 解析具体尺寸如 "100px 200px" 或 "100% 100%"
        const sizeParts = bgSize.split(/\s+/);
        if (sizeParts[0]) {
          if (sizeParts[0].endsWith('%')) {
            imgDisplayWidth = rect.width * parseFloat(sizeParts[0]) / 100;
          } else if (sizeParts[0] !== 'auto') {
            imgDisplayWidth = parseFloat(sizeParts[0]);
          }
        }
        if (sizeParts[1]) {
          if (sizeParts[1].endsWith('%')) {
            imgDisplayHeight = rect.height * parseFloat(sizeParts[1]) / 100;
          } else if (sizeParts[1] !== 'auto') {
            imgDisplayHeight = parseFloat(sizeParts[1]);
          }
        }
      }

      // 解析 background-position
      const bgPos = style.backgroundPosition;
      let offsetX = 0;
      let offsetY = 0;

      if (bgPos) {
        const posParts = bgPos.split(/\s+/);
        // 解析 X 位置
        if (posParts[0]) {
          if (posParts[0] === 'center') {
            offsetX = (rect.width - imgDisplayWidth) / 2;
          } else if (posParts[0] === 'right') {
            offsetX = rect.width - imgDisplayWidth;
          } else if (posParts[0].endsWith('%')) {
            const percent = parseFloat(posParts[0]) / 100;
            offsetX = (rect.width - imgDisplayWidth) * percent;
          } else {
            offsetX = parseFloat(posParts[0]) || 0;
          }
        }
        // 解析 Y 位置
        if (posParts[1]) {
          if (posParts[1] === 'center') {
            offsetY = (rect.height - imgDisplayHeight) / 2;
          } else if (posParts[1] === 'bottom') {
            offsetY = rect.height - imgDisplayHeight;
          } else if (posParts[1].endsWith('%')) {
            const percent = parseFloat(posParts[1]) / 100;
            offsetY = (rect.height - imgDisplayHeight) * percent;
          } else {
            offsetY = parseFloat(posParts[1]) || 0;
          }
        }
      }

      // 计算鼠标在背景图片上的位置
      const imgX = mouseX - offsetX;
      const imgY = mouseY - offsetY;

      // 检查是否在图片范围内
      if (imgX < 0 || imgX >= imgDisplayWidth || imgY < 0 || imgY >= imgDisplayHeight) {
        return null;
      }

      // 转换为图片原始坐标
      const scaleX = cachedImg.naturalWidth / imgDisplayWidth;
      const scaleY = cachedImg.naturalHeight / imgDisplayHeight;
      const srcX = Math.floor(imgX * scaleX);
      const srcY = Math.floor(imgY * scaleY);

      // 确保坐标在有效范围内
      if (srcX < 0 || srcX >= cachedImg.naturalWidth || srcY < 0 || srcY >= cachedImg.naturalHeight) {
        return null;
      }

      // 绘制图片到 canvas
      canvas.width = cachedImg.naturalWidth;
      canvas.height = cachedImg.naturalHeight;
      ctx.drawImage(cachedImg, 0, 0);

      // 获取像素颜色
      const pixel = ctx.getImageData(srcX, srcY, 1, 1).data;

      // 如果像素完全透明，返回 null
      if (pixel[3] === 0) return null;

      return {
        r: pixel[0],
        g: pixel[1],
        b: pixel[2],
        hex: this.rgbToHex(pixel[0], pixel[1], pixel[2])
      };
    } catch (err) {
      console.log('Background image color extraction failed:', err.message);
      return null;
    }
  },

  /**
   * 异步加载背景图片到缓存
   * @param {string} url - 图片 URL
   */
  loadBackgroundImage(url) {
    if (this.bgImageCache.has(url)) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.error = false;

    img.onload = () => {
      this.bgImageCache.set(url, img);
    };

    img.onerror = () => {
      img.error = true;
      this.bgImageCache.set(url, img);
    };

    // 先放入缓存一个占位，避免重复加载
    this.bgImageCache.set(url, img);
    img.src = url;
  },

  /**
   * 检查颜色是否透明或默认值
   */
  isTransparentOrDefault(rgb, colorValue) {
    if (!rgb) return true;
    const lower = colorValue.toLowerCase();
    if (lower === 'transparent' || lower === 'rgba(0, 0, 0, 0)') return true;
    // 检查是否完全透明
    const alphaMatch = colorValue.match(/rgba\([^)]+,\s*([\d.]+)\s*\)/);
    if (alphaMatch && parseFloat(alphaMatch[1]) === 0) return true;
    return false;
  },

  /**
   * 解析 RGBA 颜色字符串（包含 alpha）
   * @param {string} value - CSS 颜色值
   * @returns {Object|null} {r, g, b, a}
   */
  parseRgba(value) {
    if (!value) return null;
    if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    const match = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (match) {
      return {
        r: parseInt(match[1]),
        g: parseInt(match[2]),
        b: parseInt(match[3]),
        a: match[4] !== undefined ? parseFloat(match[4]) : 1
      };
    }
    return null;
  },

  /**
   * 解析 RGB 颜色字符串
   * @param {string} value - CSS 颜色值
   * @returns {Object|null} {r, g, b}
   */
  parseRgb(value) {
    if (!value) return null;
    const match = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (match) {
      return {
        r: parseInt(match[1]),
        g: parseInt(match[2]),
        b: parseInt(match[3])
      };
    }
    return null;
  },

  /**
   * RGB 转 HEX
   */
  rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('').toLowerCase();
  }
};
