/**
 * API 请求模块
 * 封装所有后端 API 调用
 */

const API = {
  /**
   * 获取当前项目 ID
   * @returns {number|null}
   */
  _getProjectId() {
    return State.getCurrentProjectId();
  },

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
    const projectId = this._getProjectId();
    if (!projectId) {
      return {
        projectName: 'My App',
        targetPlatform: ['flutter'],
        designSystem: {},
        sharedComponents: [],
        htmlFiles: [],
        pageGroups: []
      };
    }
    const res = await fetch(`/api/pages?projectId=${projectId}`);
    return res.json();
  },

  /**
   * 保存页面配置
   * @param {Object} pagesConfig - 页面配置
   * @returns {Promise<Object>}
   */
  async savePages(pagesConfig) {
    const projectId = this._getProjectId();
    if (!projectId) {
      return { error: '请先选择项目' };
    }
    const res = await fetch(`/api/pages?projectId=${projectId}`, {
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
    const projectId = this._getProjectId();
    if (!projectId) {
      return { files: [], htmlPath: '' };
    }
    const res = await fetch(`/api/scan-html?projectId=${projectId}`);
    return res.json();
  },

  /**
   * 分析 HTML 文件
   * @param {string} path - 文件路径
   * @returns {Promise<Object>}
   */
  async analyzeHtml(path) {
    const projectId = this._getProjectId();
    const res = await fetch(`/api/analyze-html?projectId=${projectId}&path=${encodeURIComponent(path)}`);
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

  // ==================== 项目管理 API ====================

  /**
   * 获取所有项目
   * @returns {Promise<Object>}
   */
  async getProjects() {
    const res = await fetch('/api/projects');
    return res.json();
  },

  /**
   * 获取单个项目
   * @param {number} id - 项目 ID
   * @returns {Promise<Object>}
   */
  async getProject(id) {
    const res = await fetch(`/api/projects/${id}`);
    return res.json();
  },

  /**
   * 创建项目（带 ZIP 上传）
   * @param {string} name - 项目名称
   * @param {string} description - 项目描述
   * @param {File} zipFile - ZIP 文件
   * @returns {Promise<Object>}
   */
  async createProject(name, description, zipFile) {
    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', description || '');
    if (zipFile) {
      formData.append('htmlZip', zipFile);
    }

    const res = await fetch('/api/projects', {
      method: 'POST',
      body: formData
    });
    return res.json();
  },

  /**
   * 更新项目信息
   * @param {number} id - 项目 ID
   * @param {string} name - 项目名称
   * @param {string} description - 项目描述
   * @param {Object} designSystem - 设计系统配置
   * @returns {Promise<Object>}
   */
  async updateProject(id, name, description, designSystem = undefined) {
    const body = { name, description };
    if (designSystem !== undefined) {
      body.designSystem = designSystem;
    }
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return res.json();
  },

  /**
   * 替换项目 HTML（上传新的 ZIP）
   * @param {number} id - 项目 ID
   * @param {File} zipFile - ZIP 文件
   * @returns {Promise<Object>}
   */
  async replaceProjectHtml(id, zipFile) {
    const formData = new FormData();
    formData.append('htmlZip', zipFile);

    const res = await fetch(`/api/projects/${id}/html`, {
      method: 'POST',
      body: formData
    });
    return res.json();
  },

  /**
   * 删除项目
   * @param {number} id - 项目 ID
   * @returns {Promise<Object>}
   */
  async deleteProject(id) {
    const res = await fetch(`/api/projects/${id}`, {
      method: 'DELETE'
    });
    return res.json();
  },

  // ==================== 编辑会话 API ====================

  /**
   * 注册编辑会话
   * @param {number} projectId - 项目 ID
   * @param {string} sessionId - 会话 ID
   * @param {string} editorName - 编辑者名称
   * @returns {Promise<Object>}
   */
  async registerSession(projectId, sessionId, editorName) {
    const res = await fetch('/api/session/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, sessionId, editorName })
    });
    return res.json();
  },

  /**
   * 发送心跳
   * @param {number} projectId - 项目 ID
   * @param {string} sessionId - 会话 ID
   * @returns {Promise<Object>}
   */
  async sessionHeartbeat(projectId, sessionId) {
    const res = await fetch('/api/session/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, sessionId })
    });
    return res.json();
  },

  /**
   * 检查会话状态
   * @param {number} projectId - 项目 ID
   * @param {string} sessionId - 会话 ID
   * @returns {Promise<Object>}
   */
  async checkSession(projectId, sessionId) {
    const res = await fetch(`/api/session/check?projectId=${projectId}&sessionId=${encodeURIComponent(sessionId)}`);
    return res.json();
  },

  /**
   * 释放编辑会话
   * @param {number} projectId - 项目 ID
   * @param {string} sessionId - 会话 ID
   * @returns {Promise<Object>}
   */
  async releaseSession(projectId, sessionId) {
    const res = await fetch('/api/session/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, sessionId })
    });
    return res.json();
  },

  /**
   * 强制接管会话
   * @param {number} projectId - 项目 ID
   * @param {string} sessionId - 会话 ID
   * @param {string} editorName - 编辑者名称
   * @returns {Promise<Object>}
   */
  async forceAcquireSession(projectId, sessionId, editorName) {
    const res = await fetch('/api/session/force-acquire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, sessionId, editorName })
    });
    return res.json();
  }
};
