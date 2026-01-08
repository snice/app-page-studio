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

    // 添加交互
    addInteractionFromElement(selector, type);

    // 关闭选择器
    togglePicker();
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
