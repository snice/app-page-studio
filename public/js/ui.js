/**
 * UI 交互模块
 * 处理 DOM 渲染和用户交互
 */

const UI = {
  /**
   * 生成图标 HTML
   * @param {string} name - 图标名称
   * @param {string} size - 尺寸 (sm/md/lg/xl)
   * @returns {string} HTML 字符串
   */
  icon(name, size = '') {
    return size
      ? `<icon-component name="${name}" size="${size}"></icon-component>`
      : `<icon-component name="${name}"></icon-component>`;
  },

  // ==================== 工具函数 ====================

  /**
   * 显示 Toast 消息
   * @param {string} message - 消息内容
   */
  showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
  },

  /**
   * 复制文本到剪贴板
   * @param {string} text - 文本内容
   */
  copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    this.showToast('已复制: ' + text);
  },

  // ==================== 项目显示 ====================

  /**
   * 更新项目路径显示
   */
  updateProjectDisplay() {
    const display = document.getElementById('projectPathDisplay');
    const currentProject = State.getCurrentProject();
    if (currentProject) {
      display.textContent = currentProject.name;
    } else {
      display.textContent = '未选择';
    }
  },

  // ==================== 文件列表渲染 ====================

  /**
   * 渲染文件列表
   */
  renderFileList() {
    const container = document.getElementById('fileList');
    const groups = State.pagesConfig.pageGroups || [];
    const files = State.pagesConfig.htmlFiles || [];

    let html = '';

    // 渲染分组
    for (const group of groups) {
      const groupFiles = files.filter(f => f.groupId === group.id);
      html += `
        <div class="file-group" data-group-id="${group.id}">
          <div class="file-group-header" style="border-left-color: ${group.color || '#6366f1'}">
            <div class="group-color" style="background: ${group.color || '#6366f1'}"></div>
            <span class="group-name">${group.name}</span>
            <span class="group-count">${groupFiles.length}</span>
            <div class="group-actions">
              <button class="btn btn-icon btn-sm" onclick="event.stopPropagation(); editGroup('${group.id}')" title="编辑">
                ${this.icon('edit', 'sm')}
              </button>
              <button class="btn btn-icon btn-sm" onclick="event.stopPropagation(); deleteGroup('${group.id}')" title="删除">
                ${this.icon('trash', 'sm')}
              </button>
            </div>
          </div>
          <div class="group-files">
            ${groupFiles.map(f => this.renderFileItem(f, group.color)).join('')}
          </div>
        </div>
      `;
    }

    // 渲染未分组文件
    const ungroupedFiles = files.filter(f => !f.groupId);
    if (ungroupedFiles.length > 0) {
      html += `
        <div class="ungrouped-section">
          <div class="ungrouped-title">未分组</div>
          ${ungroupedFiles.map(f => this.renderFileItem(f)).join('')}
        </div>
      `;
    }

    if (files.length === 0) {
      html = `
        <div style="padding: 60px 20px; text-align: center;">
          <div style="margin-bottom: 16px; opacity: 0.4;">
            ${this.icon('folder', 'xl')}
          </div>
          <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 6px;">暂无 HTML 文件</p>
          <p style="font-size: 12px; color: var(--text-muted);">请设置 HTML 路径</p>
        </div>
      `;
    }

    container.innerHTML = html;
    this.updateGroupSelect();
  },

  /**
   * 渲染单个文件项
   * @param {Object} file - 文件对象
   * @param {string} groupColor - 分组颜色
   * @returns {string} HTML 字符串
   */
  renderFileItem(file, groupColor) {
    const isActive = State.currentFile && State.currentFile.path === file.path;
    const isSelected = State.selectedFiles.has(file.path);

    return `
      <div class="file-item ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}"
           data-path="${file.path}"
           onclick="selectFile('${file.path}')"
           ${groupColor ? `style="border-left-color: ${isActive ? 'white' : groupColor}"` : ''}>
        <span class="file-icon">${this.icon('file')}</span>
        <div class="file-info">
          <div class="file-name">${file.stateName || file.name}</div>
          <div class="file-path">${file.path}</div>
        </div>
        ${file.stateName ? `<span class="file-state-tag">${file.stateName}</span>` : ''}
      </div>
    `;
  },

  /**
   * 更新选择工具栏
   */
  updateSelectionToolbar() {
    const toolbar = document.getElementById('selectionToolbar');
    const count = document.getElementById('selectionCount');
    count.textContent = State.selectedFiles.size;
    toolbar.classList.toggle('active', State.selectedFiles.size > 0);
  },

  /**
   * 更新分组选择下拉框
   */
  updateGroupSelect() {
    const select = document.getElementById('fileGroup');
    const groups = State.pagesConfig.pageGroups || [];

    select.innerHTML = '<option value="">未分组</option>' +
      groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');

    if (State.currentFile) {
      select.value = State.currentFile.groupId || '';
    }
  },

  // ==================== 面板渲染 ====================

  /**
   * 加载文件配置到面板
   */
  loadFileToPanel() {
    if (!State.currentFile) return;

    document.getElementById('fileStateName').value = State.currentFile.stateName || '';
    document.getElementById('fileDescription').value = State.currentFile.description || '';
    document.getElementById('fileGroup').value = State.currentFile.groupId || '';

    this.renderInteractionList();
    this.renderImageReplacementList();
  },

  /**
   * 渲染交互列表
   */
  renderInteractionList() {
    const container = document.getElementById('interactionList');
    if (!State.currentFile || !State.currentFile.interactions || State.currentFile.interactions.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:24px;background:var(--bg);border-radius:var(--radius-md);border:1px dashed var(--border);">暂无交互配置</div>';
      return;
    }

    container.innerHTML = State.currentFile.interactions.map((item, i) => `
      <div class="interaction-item">
        <div class="interaction-header">
          <span class="interaction-selector clickable" onclick="highlightElement('${this.escapeSelector(item.selector)}')" title="点击定位元素">${item.selector}</span>
          <span class="interaction-type">${item.eventType}</span>
          <button class="delete-btn" onclick="removeInteraction(${i})">
            ${this.icon('x', 'sm')}
          </button>
        </div>
        <input class="form-input" value="${item.action}" placeholder="动作描述"
               onchange="updateInteraction(${i}, 'action', this.value)" style="margin-top:8px;">
      </div>
    `).join('');
  },

  /**
   * 渲染图片替换列表
   */
  renderImageReplacementList() {
    const container = document.getElementById('imageReplacementList');
    if (!State.currentFile || !State.currentFile.imageReplacements || State.currentFile.imageReplacements.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:24px;background:var(--bg);border-radius:var(--radius-md);border:1px dashed var(--border);">暂无图片替换</div>';
      return;
    }

    container.innerHTML = State.currentFile.imageReplacements.map((item, i) => `
      <div class="interaction-item">
        <div class="interaction-header">
          <span class="interaction-selector clickable" onclick="highlightElement('${this.escapeSelector(item.selector || '')}')" title="点击定位元素">${item.selector || '未指定'}</span>
          <span class="interaction-type" style="background:linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%);">图片</span>
          <button class="delete-btn" onclick="removeImageReplacement(${i})">
            ${this.icon('x', 'sm')}
          </button>
        </div>
        <input class="form-input" value="${item.selector || ''}" placeholder="元素选择器"
               onchange="updateImageReplacement(${i}, 'selector', this.value)" style="margin-top:8px;">
        <input class="form-input" value="${item.imagePath || ''}" placeholder="图片路径（如：assets/banner.png）"
               onchange="updateImageReplacement(${i}, 'imagePath', this.value)" style="margin-top:4px;">
        <input class="form-input" value="${item.description || ''}" placeholder="图片描述（可选）"
               onchange="updateImageReplacement(${i}, 'description', this.value)" style="margin-top:4px;">
      </div>
    `).join('');
  },

  /**
   * 转义选择器中的特殊字符用于 onclick
   */
  escapeSelector(selector) {
    if (!selector) return '';
    return selector.replace(/'/g, "\\'").replace(/"/g, '\\"');
  },

  /**
   * 渲染分析结果
   * @param {Object} data - 分析数据
   */
  renderAnalysis(data) {
    // 结构标签
    const structureTags = document.getElementById('structureTags');
    const structures = [];
    if (data.structure.hasHeader) structures.push('Header');
    if (data.structure.hasFooter) structures.push('Footer/TabBar');
    if (data.structure.hasList) structures.push('列表');
    if (data.structure.hasForm) structures.push('表单');
    if (data.structure.hasModal) structures.push('弹窗');
    if (data.structure.hasCard) structures.push('卡片');
    structureTags.innerHTML = structures.map(s => `<span class="tag active">${s}</span>`).join('') || '<span style="color:var(--text-muted);font-size:12px;">无特殊结构</span>';

    // 颜色
    const colorGrid = document.getElementById('colorGrid');
    colorGrid.innerHTML = data.colors.slice(0, 16).map(c =>
      `<div class="color-chip" style="background:${c}" data-color="${c}" onclick="UI.copyToClipboard('${c}')"></div>`
    ).join('') || '<span style="color:var(--text-muted);font-size:12px;">未提取到颜色</span>';

    // 可交互元素
    const interactiveElements = document.getElementById('interactiveElements');
    interactiveElements.innerHTML = data.interactiveElements.slice(0, 10).map(el => `
      <div class="tag clickable" style="margin-bottom:6px; display:block; padding:10px 12px;" onclick="addInteractionFromElement('${el.selector}', '${el.type}')">
        <strong style="color:var(--primary);">${el.type}</strong>
        <span style="color:var(--text-secondary);margin-left:6px;">${el.text || el.selector}</span>
      </div>
    `).join('') || '<span style="color:var(--text-muted);font-size:12px;">未发现可交互元素</span>';
  },

  // ==================== 预览 ====================

  /**
   * 预览 HTML 文件
   * @param {string} path - 文件路径
   */
  previewHtml(path) {
    const screen = document.getElementById('phoneScreen');
    const projectId = State.getCurrentProjectId();
    if (!projectId) {
      screen.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">请先选择项目</div>';
      return;
    }
    screen.innerHTML = `<iframe id="previewFrame" src="/html/${projectId}/${path}"></iframe>`;
    document.getElementById('previewInfo').textContent = path;

    // 设置元素选择器
    setTimeout(() => {
      const iframe = document.getElementById('previewFrame');
      if (iframe && iframe.contentWindow) {
        Picker.setup(iframe);
      }
    }, 500);
  },

  // ==================== 模态框 ====================

  /**
   * 渲染项目列表
   */
  renderProjectList() {
    const container = document.getElementById('projectList');
    const projects = State.config.projects || [];
    const currentProjectId = State.getCurrentProjectId();

    if (projects.length === 0) {
      container.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px;">暂无项目，请创建新项目</div>';
      return;
    }

    container.innerHTML = projects.map(p => `
      <div class="browser-item ${p.id === currentProjectId ? 'selected' : ''}" data-project-id="${p.id}">
        <span class="browser-icon">${this.icon('folder')}</span>
        <div style="flex:1;min-width:0;" onclick="switchToProject(${p.id})">
          <div class="browser-name">${p.name}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${p.description || '无描述'}</div>
        </div>
        <div class="project-actions" style="display:flex;gap:4px;">
          <button class="btn btn-icon btn-sm" onclick="event.stopPropagation(); openDesignSystem(${p.id})" title="设计系统">
            ${this.icon('palette', 'sm')}
          </button>
          <button class="btn btn-icon btn-sm" onclick="event.stopPropagation(); editProject(${p.id})" title="编辑">
            ${this.icon('edit', 'sm')}
          </button>
          <button class="btn btn-icon btn-sm" onclick="event.stopPropagation(); replaceProjectHtml(${p.id})" title="替换 HTML">
            ${this.icon('upload', 'sm')}
          </button>
          <button class="btn btn-icon btn-sm" onclick="event.stopPropagation(); deleteProject(${p.id})" title="删除">
            ${this.icon('trash', 'sm')}
          </button>
        </div>
      </div>
    `).join('');
  },

  /**
   * 渲染目录浏览列表
   * @param {Array} items - 目录项
   */
  renderBrowserList(items) {
    const list = document.getElementById('projectBrowserList');
    let html = items.filter(i => i.isDirectory).map(item => `
      <div class="browser-item" ondblclick="browseProjectPath('${item.path}')" onclick="selectProjectPath('${item.path}')">
        <span class="browser-icon">${this.icon('folder')}</span>
        <span class="browser-name">${item.name}</span>
      </div>
    `).join('');

    list.innerHTML = html || '<div style="padding:20px;text-align:center;color:var(--text-secondary)">空目录</div>';
  },

  /**
   * 渲染分组颜色选择器
   * @param {string} selectedColor - 当前选中的颜色
   */
  renderGroupColorPicker(selectedColor = null) {
    const picker = document.getElementById('groupColorPicker');
    picker.innerHTML = State.groupColors.map((c, i) =>
      `<div class="color-option ${(selectedColor ? c === selectedColor : i === 0) ? 'selected' : ''}" style="background:${c}" data-color="${c}" onclick="selectGroupColor(this)"></div>`
    ).join('');
  },

  // ==================== 模态框控制 ====================

  showModal(id) {
    document.getElementById(id).classList.add('active');
  },

  closeModal(id) {
    document.getElementById(id).classList.remove('active');
  },

  // ==================== 编辑会话警告 ====================

  /**
   * 显示编辑冲突警告
   * @param {string} editorName - 当前编辑者名称
   * @param {string} startedAt - 开始编辑时间
   */
  showEditWarning(editorName, startedAt) {
    let warning = document.getElementById('editWarning');
    if (!warning) {
      warning = document.createElement('div');
      warning.id = 'editWarning';
      warning.className = 'edit-warning';
      document.body.appendChild(warning);
    }

    const timeStr = startedAt ? new Date(startedAt).toLocaleTimeString() : '';
    warning.innerHTML = `
      <div class="edit-warning-content">
        ${this.icon('alert', 'md')}
        <div class="edit-warning-text">
          <strong>${editorName}</strong> 正在编辑此项目
          ${timeStr ? `<span class="edit-warning-time">（${timeStr} 开始）</span>` : ''}
        </div>
        <button class="btn btn-sm" onclick="forceAcquireEdit()">接管编辑</button>
        <button class="btn btn-icon btn-sm" onclick="UI.hideEditWarning()">
          ${this.icon('x', 'sm')}
        </button>
      </div>
    `;
    warning.classList.add('show');
  },

  /**
   * 隐藏编辑冲突警告
   */
  hideEditWarning() {
    const warning = document.getElementById('editWarning');
    if (warning) {
      warning.classList.remove('show');
    }
  }
};

// 全局快捷函数
function showToast(message) {
  UI.showToast(message);
}

function copyToClipboard(text) {
  UI.copyToClipboard(text);
}
