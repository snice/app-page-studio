/**
 * 状态管理模块
 * 管理应用的全局状态
 */

const State = {
  // 工具配置
  config: {
    currentProject: '',
    projects: []
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

  // 正在编辑的分组 ID
  editingGroupId: null,

  // 项目浏览路径
  projectBrowsePath: '',

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
  }
};
