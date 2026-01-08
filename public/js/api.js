/**
 * API 请求模块
 * 封装所有后端 API 调用
 */

const API = {
  /**
   * 获取工具配置
   * @returns {Promise<Object>}
   */
  async getConfig() {
    const res = await fetch('/api/config');
    return res.json();
  },

  /**
   * 获取页面配置
   * @returns {Promise<Object>}
   */
  async getPages() {
    const res = await fetch('/api/pages');
    return res.json();
  },

  /**
   * 保存页面配置
   * @param {Object} pagesConfig - 页面配置
   * @returns {Promise<Object>}
   */
  async savePages(pagesConfig) {
    const res = await fetch('/api/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pagesConfig)
    });
    return res.json();
  },

  /**
   * 扫描 HTML 文件
   * @returns {Promise<Object>}
   */
  async scanHtmlFiles() {
    const res = await fetch('/api/scan-html');
    return res.json();
  },

  /**
   * 分析 HTML 文件
   * @param {string} path - 文件路径
   * @returns {Promise<Object>}
   */
  async analyzeHtml(path) {
    const res = await fetch(`/api/analyze-html?path=${encodeURIComponent(path)}`);
    return res.json();
  },

  /**
   * 提取图片
   * @param {string} path - 文件路径
   * @returns {Promise<Object>}
   */
  async extractImages(path) {
    const res = await fetch(`/api/extract-images?path=${encodeURIComponent(path)}`);
    return res.json();
  },

  /**
   * 复制图片到项目目录
   * @param {Array} images - 图片列表
   * @param {string} targetDir - 目标目录
   * @returns {Promise<Object>}
   */
  async copyImages(images, targetDir) {
    const res = await fetch('/api/copy-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images, targetDir })
    });
    return res.json();
  },

  /**
   * 生成提示词
   * @param {Object} options - 生成选项
   * @returns {Promise<Object>}
   */
  async generatePrompt(options) {
    const res = await fetch('/api/generate-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options)
    });
    return res.json();
  },

  /**
   * 切换项目
   * @param {string} projectPath - 项目路径
   * @returns {Promise<Object>}
   */
  async switchProject(projectPath) {
    const res = await fetch('/api/switch-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath })
    });
    return res.json();
  },

  /**
   * 移除项目
   * @param {string} projectPath - 项目路径
   * @returns {Promise<Object>}
   */
  async removeProject(projectPath) {
    const res = await fetch('/api/remove-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath })
    });
    return res.json();
  },

  /**
   * 浏览目录
   * @param {string} path - 目录路径
   * @returns {Promise<Object>}
   */
  async browse(path) {
    const res = await fetch(`/api/browse?path=${encodeURIComponent(path)}`);
    return res.json();
  }
};
