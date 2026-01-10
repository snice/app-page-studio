/**
 * 状态管理模块
 * 管理应用的全局状态
 */

const STORAGE_KEY_CURRENT_PROJECT = 'appPageStudio_currentProjectId';
const STORAGE_KEY_SESSION_ID = 'appPageStudio_sessionId';
const STORAGE_KEY_EDITOR_NAME = 'appPageStudio_editorName';

/**
 * 生成唯一 Session ID
 */
function generateSessionId() {
  return 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
}

const State = {
  // 工具配置
  config: {
    currentProject: null,  // 当前项目 ID（从 localStorage 读取）
    projects: []           // 项目列表 [{id, name, description, createdAt, updatedAt}]
  },

  // 编辑会话状态
  session: {
    sessionId: null,       // 当前会话 ID
    editorName: null,      // 编辑者名称
    isCurrentEditor: true, // 是否是当前编辑者
    currentEditor: null,   // 当前编辑者名称（如果不是自己）
    heartbeatTimer: null   // 心跳定时器
  },

  // 页面配置
  pagesConfig: {
    projectName: '',
    targetPlatform: ['flutter'],
    designSystem: {},
    sharedComponents: [],
    htmlFiles: [],
    pageGroups: []
  },

  // HTML 文件列表
  htmlFiles: [],

  // 当前选中的文件
  currentFile: null,

  // 多选的文件集合
  selectedFiles: new Set(),

  // 元素选择器是否激活
  isPickerActive: false,

  // 取色器是否激活
  isColorPickerActive: false,

  // 取到的颜色列表
  pickedColors: [],

  // 当前编辑的设计系统数据
  editingDesignSystem: null,

  // 当前编辑的设计系统项目 ID
  editingDesignProjectId: null,

  // 正在编辑的分组 ID
  editingGroupId: null,

  // 正在编辑的项目 ID
  editingProjectId: null,

  // 分组颜色选项
  groupColors: [
    '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
    '#f59e0b', '#22c55e', '#14b8a6', '#3b82f6'
  ],

  /**
   * 更新配置
   * @param {Object} newConfig - 新配置
   */
  setConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  },

  /**
   * 获取当前项目 ID（从 localStorage）
   * @returns {number|null}
   */
  getCurrentProjectId() {
    const stored = localStorage.getItem(STORAGE_KEY_CURRENT_PROJECT);
    return stored ? parseInt(stored, 10) : null;
  },

  /**
   * 设置当前项目 ID（保存到 localStorage）
   * @param {number|null} projectId
   */
  setCurrentProjectId(projectId) {
    if (projectId) {
      localStorage.setItem(STORAGE_KEY_CURRENT_PROJECT, String(projectId));
      this.config.currentProject = projectId;
    } else {
      localStorage.removeItem(STORAGE_KEY_CURRENT_PROJECT);
      this.config.currentProject = null;
    }
  },

  /**
   * 获取当前项目对象
   * @returns {Object|null}
   */
  getCurrentProject() {
    const projectId = this.getCurrentProjectId();
    if (!projectId) return null;
    return this.config.projects.find(p => p.id === projectId) || null;
  },

  /**
   * 更新页面配置
   * @param {Object} newPagesConfig - 新页面配置
   */
  setPagesConfig(newPagesConfig) {
    this.pagesConfig = {
      projectName: newPagesConfig.projectName || 'My App',
      targetPlatform: newPagesConfig.targetPlatform || ['flutter'],
      designSystem: newPagesConfig.designSystem || {},
      sharedComponents: newPagesConfig.sharedComponents || [],
      htmlFiles: newPagesConfig.htmlFiles || [],
      pageGroups: newPagesConfig.pageGroups || []
    };
  },

  /**
   * 同步扫描到的文件到配置
   */
  syncFilesToConfig() {
    const existingFilesMap = new Map(
      (this.pagesConfig.htmlFiles || []).map(f => [f.path, f])
    );

    const updatedFiles = [];
    for (const file of this.htmlFiles) {
      const existing = existingFilesMap.get(file.path);
      if (existing) {
        updatedFiles.push(existing);
      } else {
        updatedFiles.push({
          path: file.path,
          name: file.name,
          stateName: '',
          description: '',
          groupId: null,
          interactions: []
        });
      }
    }

    this.pagesConfig.htmlFiles = updatedFiles;
    console.log('syncFilesToConfig 完成, htmlFiles:', this.pagesConfig.htmlFiles.length, 'pageGroups:', this.pagesConfig.pageGroups?.length);
  },

  /**
   * 设置当前文件
   * @param {string} path - 文件路径
   * @returns {Object|null} 当前文件对象
   */
  setCurrentFile(path) {
    const file = this.pagesConfig.htmlFiles.find(f => f.path === path);
    if (file) {
      this.currentFile = file;
    }
    return this.currentFile;
  },

  /**
   * 更新当前文件配置
   * @param {Object} updates - 要更新的字段
   */
  updateCurrentFile(updates) {
    if (!this.currentFile) return;
    Object.assign(this.currentFile, updates);
  },

  /**
   * 添加/移除选中文件
   * @param {string} path - 文件路径
   */
  toggleSelectedFile(path) {
    if (this.selectedFiles.has(path)) {
      this.selectedFiles.delete(path);
    } else {
      this.selectedFiles.add(path);
    }
  },

  /**
   * 清除所有选中
   */
  clearSelection() {
    this.selectedFiles.clear();
  },

  /**
   * 添加分组
   * @param {Object} group - 分组对象
   */
  addGroup(group) {
    if (!this.pagesConfig.pageGroups) {
      this.pagesConfig.pageGroups = [];
    }
    this.pagesConfig.pageGroups.push(group);
  },

  /**
   * 更新分组
   * @param {string} groupId - 分组 ID
   * @param {Object} updates - 更新内容
   */
  updateGroup(groupId, updates) {
    const group = this.pagesConfig.pageGroups.find(g => g.id === groupId);
    if (group) {
      Object.assign(group, updates);
    }
  },

  /**
   * 删除分组
   * @param {string} groupId - 分组 ID
   */
  deleteGroup(groupId) {
    this.pagesConfig.pageGroups = this.pagesConfig.pageGroups.filter(g => g.id !== groupId);

    // 移除文件的分组关联
    for (const file of this.pagesConfig.htmlFiles) {
      if (file.groupId === groupId) {
        file.groupId = null;
      }
    }
  },

  /**
   * 为选中的文件分配分组
   * @param {string} groupId - 分组 ID
   */
  assignSelectedFilesToGroup(groupId) {
    for (const path of this.selectedFiles) {
      const file = this.pagesConfig.htmlFiles.find(f => f.path === path);
      if (file) {
        file.groupId = groupId;
      }
    }
    this.clearSelection();
  },

  /**
   * 添加交互
   * @param {Object} interaction - 交互配置
   */
  addInteraction(interaction) {
    if (!this.currentFile) return;
    if (!this.currentFile.interactions) {
      this.currentFile.interactions = [];
    }
    this.currentFile.interactions.push(interaction);
  },

  /**
   * 更新交互
   * @param {number} index - 交互索引
   * @param {string} field - 字段名
   * @param {*} value - 值
   */
  updateInteraction(index, field, value) {
    if (!this.currentFile || !this.currentFile.interactions) return;
    this.currentFile.interactions[index][field] = value;
  },

  /**
   * 删除交互
   * @param {number} index - 交互索引
   */
  removeInteraction(index) {
    if (!this.currentFile || !this.currentFile.interactions) return;
    this.currentFile.interactions.splice(index, 1);
  },

  /**
   * 添加图片替换
   * @param {Object} imageReplacement - 图片替换配置
   */
  addImageReplacement(imageReplacement) {
    if (!this.currentFile) return;
    if (!this.currentFile.imageReplacements) {
      this.currentFile.imageReplacements = [];
    }
    this.currentFile.imageReplacements.push(imageReplacement);
  },

  /**
   * 更新图片替换
   * @param {number} index - 索引
   * @param {string} field - 字段名
   * @param {*} value - 值
   */
  updateImageReplacement(index, field, value) {
    if (!this.currentFile || !this.currentFile.imageReplacements) return;
    this.currentFile.imageReplacements[index][field] = value;
  },

  /**
   * 删除图片替换
   * @param {number} index - 索引
   */
  removeImageReplacement(index) {
    if (!this.currentFile || !this.currentFile.imageReplacements) return;
    this.currentFile.imageReplacements.splice(index, 1);
  },

  /**
   * 添加功能描述
   * @param {Object} functionDescription - 功能描述配置
   */
  addFunctionDescription(functionDescription) {
    if (!this.currentFile) return;
    if (!this.currentFile.functionDescriptions) {
      this.currentFile.functionDescriptions = [];
    }
    this.currentFile.functionDescriptions.push(functionDescription);
  },

  /**
   * 更新功能描述
   * @param {number} index - 索引
   * @param {string} field - 字段名
   * @param {*} value - 值
   */
  updateFunctionDescription(index, field, value) {
    if (!this.currentFile || !this.currentFile.functionDescriptions) return;
    this.currentFile.functionDescriptions[index][field] = value;
  },

  /**
   * 删除功能描述
   * @param {number} index - 索引
   */
  removeFunctionDescription(index) {
    if (!this.currentFile || !this.currentFile.functionDescriptions) return;
    this.currentFile.functionDescriptions.splice(index, 1);
  },

  // ==================== 会话管理 ====================

  /**
   * 获取或创建 Session ID（存储在 sessionStorage，每个标签页唯一）
   * @returns {string}
   */
  getSessionId() {
    if (this.session.sessionId) {
      return this.session.sessionId;
    }
    // 使用 sessionStorage，每个标签页独立
    let sessionId = sessionStorage.getItem(STORAGE_KEY_SESSION_ID);
    if (!sessionId) {
      sessionId = generateSessionId();
      sessionStorage.setItem(STORAGE_KEY_SESSION_ID, sessionId);
    }
    this.session.sessionId = sessionId;
    return sessionId;
  },

  /**
   * 获取编辑者名称（存储在 localStorage，跨标签页共享）
   * @returns {string|null}
   */
  getEditorName() {
    if (this.session.editorName) {
      return this.session.editorName;
    }
    const name = localStorage.getItem(STORAGE_KEY_EDITOR_NAME);
    this.session.editorName = name;
    return name;
  },

  /**
   * 设置编辑者名称
   * @param {string} name
   */
  setEditorName(name) {
    this.session.editorName = name;
    if (name) {
      localStorage.setItem(STORAGE_KEY_EDITOR_NAME, name);
    } else {
      localStorage.removeItem(STORAGE_KEY_EDITOR_NAME);
    }
  },

  /**
   * 更新会话状态
   * @param {Object} status - { isCurrentEditor, currentEditor }
   */
  updateSessionStatus(status) {
    this.session.isCurrentEditor = status.isCurrentEditor;
    this.session.currentEditor = status.currentEditor;
  },

  /**
   * 启动心跳
   */
  startHeartbeat() {
    this.stopHeartbeat();
    // 每 2 分钟发送一次心跳
    this.session.heartbeatTimer = setInterval(() => {
      const projectId = this.getCurrentProjectId();
      if (projectId) {
        API.sessionHeartbeat(projectId, this.getSessionId());
      }
    }, 2 * 60 * 1000);
  },

  /**
   * 停止心跳
   */
  stopHeartbeat() {
    if (this.session.heartbeatTimer) {
      clearInterval(this.session.heartbeatTimer);
      this.session.heartbeatTimer = null;
    }
  }
};
