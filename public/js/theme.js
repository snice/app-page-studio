/**
 * 主题管理模块
 * 处理浅色/深色主题切换和本地存储
 */

const Theme = {
  LIGHT: 'light',
  DARK: 'dark',
  STORAGE_KEY: 'theme',

  /**
   * 初始化主题（页面加载时调用）
   */
  init() {
    const savedTheme = localStorage.getItem(this.STORAGE_KEY) || this.DARK;
    this.apply(savedTheme);
  },

  /**
   * 应用指定主题
   * @param {string} theme - 'light' 或 'dark'
   */
  apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    this.updateIcon(theme);
  },

  /**
   * 更新主题切换按钮图标
   * @param {string} theme - 当前主题
   */
  updateIcon(theme) {
    const icon = document.getElementById('themeIcon');
    if (icon) {
      const iconName = theme === this.LIGHT ? 'sun' : 'moon';
      icon.innerHTML = `<icon-component name="${iconName}" size="md"></icon-component>`;
    }
  },

  /**
   * 获取当前主题
   * @returns {string} 当前主题
   */
  current() {
    return document.documentElement.getAttribute('data-theme') || this.DARK;
  },

  /**
   * 切换主题
   */
  toggle() {
    const currentTheme = this.current();
    const newTheme = currentTheme === this.LIGHT ? this.DARK : this.LIGHT;
    this.apply(newTheme);
    localStorage.setItem(this.STORAGE_KEY, newTheme);

    // 显示提示
    if (typeof showToast === 'function') {
      showToast(newTheme === this.LIGHT ? '已切换到浅色主题' : '已切换到深色主题');
    }
  }
};

// 页面加载时立即初始化主题（防止闪烁）
Theme.init();

// 全局切换函数（供 onclick 使用）
function toggleTheme() {
  Theme.toggle();
}
