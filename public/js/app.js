/**
 * 主应用入口
 * 初始化和事件绑定
 */

// ==================== 初始化 ====================

async function init() {
  // 确保编辑者名称已设置
  await ensureEditorName();
  await loadConfig();
  await registerEditSession();
  await loadPages();
  await scanHtmlFiles();
  initWebSocket();
  initEventListeners();
  console.log('初始化完成, pagesConfig:', State.pagesConfig);
}

/**
 * 确保编辑者名称已设置
 */
async function ensureEditorName() {
  let name = State.getEditorName();
  if (!name) {
    name = prompt('请输入您的名称（用于标识编辑者）:', '');
    if (name && name.trim()) {
      State.setEditorName(name.trim());
    } else {
      State.setEditorName('匿名用户');
    }
  }
}

/**
 * 注册编辑会话
 */
async function registerEditSession() {
  const projectId = State.getCurrentProjectId();
  if (!projectId) {
    UI.hideEditWarning();
    return;
  }

  const sessionId = State.getSessionId();
  const editorName = State.getEditorName() || '匿名用户';

  try {
    const result = await API.registerSession(projectId, sessionId, editorName);
    State.updateSessionStatus(result);

    if (!result.isNewEditor) {
      // 有其他人在编辑，显示警告
      UI.showEditWarning(result.currentEditor, result.startedAt);
    } else {
      UI.hideEditWarning();
      // 启动心跳
      State.startHeartbeat();
    }
  } catch (e) {
    console.error('注册编辑会话失败:', e);
  }
}

/**
 * 强制接管编辑权限
 */
async function forceAcquireEdit() {
  const projectId = State.getCurrentProjectId();
  if (!projectId) return;

  const sessionId = State.getSessionId();
  const editorName = State.getEditorName() || '匿名用户';

  try {
    await API.forceAcquireSession(projectId, sessionId, editorName);
    State.updateSessionStatus({ isCurrentEditor: true, currentEditor: editorName });
    UI.hideEditWarning();
    State.startHeartbeat();
    showToast('已接管编辑权限');
  } catch (e) {
    showToast('接管失败: ' + e.message);
  }
}

async function loadConfig() {
  const data = await API.getConfig();
  State.setConfig(data);
  // 从 localStorage 恢复当前项目 ID，或使用第一个项目
  const storedProjectId = State.getCurrentProjectId();
  if (storedProjectId && data.projects.some(p => p.id === storedProjectId)) {
    State.config.currentProject = storedProjectId;
  } else if (data.projects.length > 0) {
    // 如果没有存储的项目 ID，或者存储的 ID 不存在，使用第一个项目
    State.setCurrentProjectId(data.projects[0].id);
  }
  UI.updateProjectDisplay();
}

async function loadPages() {
  const data = await API.getPages();
  State.setPagesConfig(data);
  console.log('loadPages 完成, pageGroups:', State.pagesConfig.pageGroups);
}

async function saveConfig() {
  const projectId = State.getCurrentProjectId();
  if (!projectId) {
    showToast('请先选择项目');
    return;
  }

  // 检查是否是当前编辑者
  const sessionId = State.getSessionId();
  const checkResult = await API.checkSession(projectId, sessionId);

  if (!checkResult.isCurrentEditor) {
    const confirmSave = confirm(
      `警告：${checkResult.currentEditor} 正在编辑此项目。\n` +
      '继续保存可能会覆盖对方的修改。\n\n' +
      '确定要强制保存吗？'
    );
    if (!confirmSave) {
      return;
    }
    // 强制获取编辑权限
    await API.forceAcquireSession(projectId, sessionId, State.getEditorName());
    State.updateSessionStatus({ isCurrentEditor: true, currentEditor: State.getEditorName() });
    UI.hideEditWarning();
    State.startHeartbeat();
  }

  await API.savePages(State.pagesConfig);
  showToast('配置已保存');
}

// ==================== HTML 文件管理 ====================

async function scanHtmlFiles() {
  const data = await API.scanHtmlFiles();
  State.htmlFiles = data.files;
  State.syncFilesToConfig();
  UI.renderFileList();
}

function selectFile(path, multiSelect = false) {
  if (multiSelect || event?.shiftKey || event?.metaKey) {
    State.toggleSelectedFile(path);
    UI.updateSelectionToolbar();
    UI.renderFileList();
    return;
  }

  State.clearSelection();
  UI.updateSelectionToolbar();

  if (State.setCurrentFile(path)) {
    UI.previewHtml(path);
    UI.loadFileToPanel();
    UI.renderFileList();
    analyzeCurrentHtml(path);
  }
}

async function analyzeCurrentHtml(path) {
  try {
    const data = await API.analyzeHtml(path);
    UI.renderAnalysis(data);
  } catch (e) {
    console.error('分析失败', e);
  }
}

function cancelSelection() {
  State.clearSelection();
  UI.updateSelectionToolbar();
  UI.renderFileList();
}

// ==================== 文件配置 ====================

function updateCurrentFile() {
  if (!State.currentFile) return;

  State.updateCurrentFile({
    stateName: document.getElementById('fileStateName').value,
    description: document.getElementById('fileDescription').value,
    groupId: document.getElementById('fileGroup').value || null
  });

  UI.renderFileList();
}

function addInteraction() {
  if (!State.currentFile) {
    showToast('请先选择文件');
    return;
  }

  State.addInteraction({
    selector: '',
    eventType: 'tap',
    action: ''
  });

  UI.renderInteractionList();
}

function addInteractionFromElement(selector, eventType) {
  if (!State.currentFile) {
    showToast('请先选择文件');
    return;
  }

  State.addInteraction({
    selector: selector,
    eventType: eventType || 'tap',
    action: ''
  });

  UI.renderInteractionList();
  showToast(`已添加: ${selector}`);
}

function updateInteraction(index, field, value) {
  State.updateInteraction(index, field, value);
}

function removeInteraction(index) {
  State.removeInteraction(index);
  UI.renderInteractionList();
}

// ==================== 元素选择器 ====================

// 全局变量存储选择菜单
let pickerActionMenu = null;

function togglePicker() {
  State.isPickerActive = !State.isPickerActive;
  const btn = document.getElementById('pickerBtn');
  const btnText = document.getElementById('pickerBtnText');
  btn.classList.toggle('active', State.isPickerActive);
  btnText.textContent = State.isPickerActive ? '点击选择' : '选择元素';

  // 如果取色器激活，先关闭它
  if (State.isPickerActive && State.isColorPickerActive) {
    toggleColorPicker();
  }

  // 关闭菜单
  hidePickerActionMenu();

  const iframe = document.getElementById('previewFrame');
  if (iframe && iframe.contentWindow) {
    if (State.isPickerActive) {
      Picker.enable(iframe);
    } else {
      Picker.disable(iframe);
    }
  }
}

/**
 * 显示选择器动作菜单
 */
function showPickerActionMenu(e, selector, eventType) {
  hidePickerActionMenu();

  const iframe = document.getElementById('previewFrame');
  const iframeRect = iframe.getBoundingClientRect();

  // 获取当前缩放值
  const zoom = typeof currentZoom !== 'undefined' ? currentZoom : 1;
  // 计算菜单位置（考虑缩放）
  const menuX = iframeRect.left + e.clientX * zoom;
  const menuY = iframeRect.top + e.clientY * zoom;

  pickerActionMenu = document.createElement('div');
  pickerActionMenu.className = 'picker-action-menu';
  pickerActionMenu.style.cssText = `
    position: fixed;
    left: ${menuX}px;
    top: ${menuY}px;
    z-index: 10001;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    padding: 4px;
    min-width: 140px;
  `;

  pickerActionMenu.innerHTML = `
    <div class="picker-menu-item" onclick="handlePickerAction('interaction', '${selector}', '${eventType}')">
      <span>${UI.icon('target', 'sm')}</span>
      <span>添加交互</span>
    </div>
    <div class="picker-menu-item" onclick="handlePickerAction('image', '${selector}', '${eventType}')">
      <span>${UI.icon('image', 'sm')}</span>
      <span>替换为图片</span>
    </div>
  `;

  document.body.appendChild(pickerActionMenu);

  // 点击其他地方关闭菜单
  setTimeout(() => {
    document.addEventListener('click', hidePickerActionMenuOnClick);
  }, 10);
}

function hidePickerActionMenuOnClick(e) {
  if (pickerActionMenu && !pickerActionMenu.contains(e.target)) {
    hidePickerActionMenu();
  }
}

function hidePickerActionMenu() {
  if (pickerActionMenu) {
    pickerActionMenu.remove();
    pickerActionMenu = null;
  }
  document.removeEventListener('click', hidePickerActionMenuOnClick);
}

/**
 * 处理选择器动作
 */
function handlePickerAction(action, selector, eventType) {
  hidePickerActionMenu();
  togglePicker();

  if (action === 'interaction') {
    addInteractionFromElement(selector, eventType);
  } else if (action === 'image') {
    addImageReplacementFromElement(selector);
  }
}

/**
 * 从元素添加图片替换
 */
function addImageReplacementFromElement(selector) {
  if (!State.currentFile) {
    showToast('请先选择文件');
    return;
  }

  State.addImageReplacement({
    selector: selector,
    imagePath: '',
    description: ''
  });

  UI.renderImageReplacementList();
  showToast(`已添加图片替换: ${selector}`);
}

/**
 * 手动添加图片替换
 */
function addImageReplacement() {
  if (!State.currentFile) {
    showToast('请先选择文件');
    return;
  }

  State.addImageReplacement({
    selector: '',
    imagePath: '',
    description: ''
  });

  UI.renderImageReplacementList();
}

function updateImageReplacement(index, field, value) {
  State.updateImageReplacement(index, field, value);
}

function removeImageReplacement(index) {
  State.removeImageReplacement(index);
  UI.renderImageReplacementList();
}

// ==================== 元素高亮 ====================

/**
 * 在 iframe 中高亮指定选择器的元素
 */
function highlightElement(selector) {
  if (!selector) {
    showToast('选择器为空');
    return;
  }

  const iframe = document.getElementById('previewFrame');
  if (!iframe || !iframe.contentDocument) {
    showToast('请先选择文件预览');
    return;
  }

  const doc = iframe.contentDocument;

  // 清除之前的高亮
  clearElementHighlight();

  try {
    // 处理以数字开头的ID选择器（如 #1_2165）
    let el;
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      el = doc.querySelector(`[id="${id}"]`);
    } else {
      el = doc.querySelector(selector);
    }
    if (el) {
      // 添加高亮样式
      el.classList.add('element-highlight');

      // 滚动到元素位置
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // 3秒后自动移除高亮
      setTimeout(() => {
        el.classList.remove('element-highlight');
      }, 3000);
    } else {
      showToast('未找到匹配的元素');
    }
  } catch (e) {
    showToast('选择器无效: ' + e.message);
  }
}

/**
 * 清除所有元素高亮
 */
function clearElementHighlight() {
  const iframe = document.getElementById('previewFrame');
  if (!iframe || !iframe.contentDocument) return;

  const doc = iframe.contentDocument;
  doc.querySelectorAll('.element-highlight').forEach(el => {
    el.classList.remove('element-highlight');
  });
}

// ==================== 取色器 ====================

function toggleColorPicker() {
  State.isColorPickerActive = !State.isColorPickerActive;
  const btn = document.getElementById('colorPickerBtn');
  const btnText = document.getElementById('colorPickerBtnText');
  btn.classList.toggle('active', State.isColorPickerActive);
  btnText.textContent = State.isColorPickerActive ? '点击取色' : '取色';

  // 如果元素选择器激活，先关闭它
  if (State.isColorPickerActive && State.isPickerActive) {
    togglePicker();
  }

  const iframe = document.getElementById('previewFrame');
  if (iframe && iframe.contentWindow) {
    if (State.isColorPickerActive) {
      ColorPicker.enable(iframe);
    } else {
      ColorPicker.disable(iframe);
    }
  }
}

function updatePickedColorsDisplay() {
  const section = document.getElementById('pickedColorsSection');
  const grid = document.getElementById('pickedColorsGrid');

  if (State.pickedColors.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  grid.innerHTML = State.pickedColors.map((color, index) => `
    <div class="picked-color-chip" style="background:${color}" title="${color}" onclick="copyToClipboard('${color}')">
      <button class="remove-btn" onclick="event.stopPropagation(); removePickedColor(${index})">
        <icon-component name="x" size="sm"></icon-component>
      </button>
    </div>
  `).join('');
}

function removePickedColor(index) {
  State.pickedColors.splice(index, 1);
  updatePickedColorsDisplay();
}

function clearPickedColors() {
  State.pickedColors = [];
  updatePickedColorsDisplay();
}

// ==================== 设计系统抽屉 ====================

function openCurrentProjectDesignSystem() {
  const projectId = State.getCurrentProjectId();
  if (!projectId) {
    showToast('请先选择项目');
    return;
  }
  openDesignSystem(projectId);
}

function openDesignSystem(projectId) {
  const project = State.config.projects.find(p => p.id === projectId);
  if (!project) {
    showToast('项目不存在');
    return;
  }

  State.editingDesignProjectId = projectId;
  State.editingDesignSystem = project.designSystem ? JSON.parse(JSON.stringify(project.designSystem)) : {};

  // 更新抽屉内容
  document.getElementById('designProjectName').textContent = project.name;
  renderDesignSystemForm();

  // 显示抽屉
  document.getElementById('designSystemDrawer').classList.add('active');
}

function closeDesignSystemDrawer(event) {
  // 如果点击的是 overlay 背景或关闭按钮，则关闭
  if (!event || event.target.id === 'designSystemDrawer') {
    document.getElementById('designSystemDrawer').classList.remove('active');
    State.editingDesignProjectId = null;
    State.editingDesignSystem = null;
  }
}

function renderDesignSystemForm() {
  const ds = State.editingDesignSystem || {};

  // 渲染颜色列表
  renderDesignColors();

  // 更新取色结果显示
  updatePickedColorsDisplay();

  // 填充间距
  const spacing = ds.spacing || {};
  document.getElementById('spacingXs').value = spacing.xs || '';
  document.getElementById('spacingSm').value = spacing.sm || '';
  document.getElementById('spacingMd').value = spacing.md || '';
  document.getElementById('spacingLg').value = spacing.lg || '';
  document.getElementById('spacingXl').value = spacing.xl || '';

  // 填充圆角
  const radius = ds.radius || {};
  document.getElementById('radiusSm').value = radius.sm || '';
  document.getElementById('radiusMd').value = radius.md || '';
  document.getElementById('radiusLg').value = radius.lg || '';
  document.getElementById('radiusXl').value = radius.xl || '';

  // 填充原始 JSON
  document.getElementById('designSystemJson').value = JSON.stringify(ds, null, 2);
}

function renderDesignColors() {
  const grid = document.getElementById('designColorsGrid');
  const colors = State.editingDesignSystem?.colors || {};
  const entries = Object.entries(colors);

  if (entries.length === 0) {
    grid.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:16px;text-align:center;background:var(--bg);border-radius:var(--radius-md);border:1px dashed var(--border);">暂无颜色配置</div>';
    return;
  }

  grid.innerHTML = entries.map(([name, value]) => `
    <div class="design-color-item">
      <input type="color" class="design-color-picker" value="${value}" onchange="updateDesignColorValue('${name}', this.value)" title="点击选择颜色">
      <div class="design-color-info">
        <input type="text" class="design-color-name-input" value="${name}" onchange="renameDesignColor('${name}', this.value)" title="颜色名称">
        <input type="text" class="design-color-value-input" value="${value}" onchange="updateDesignColorValue('${name}', this.value)" title="颜色值">
      </div>
      <button class="btn btn-icon btn-sm" onclick="removeDesignColor('${name}')" title="删除">
        ${UI.icon('trash', 'sm')}
      </button>
    </div>
  `).join('');
}

function addDesignColor() {
  const name = prompt('颜色名称（如 primary, secondary）:');
  if (!name) return;

  if (!State.editingDesignSystem.colors) {
    State.editingDesignSystem.colors = {};
  }
  // 默认颜色
  State.editingDesignSystem.colors[name.trim()] = '#6366f1';
  renderDesignColors();
  updateDesignSystemJson();
}

function updateDesignColorValue(name, value) {
  if (State.editingDesignSystem.colors && State.editingDesignSystem.colors[name] !== undefined) {
    State.editingDesignSystem.colors[name] = value;
    renderDesignColors();
    updateDesignSystemJson();
  }
}

function renameDesignColor(oldName, newName) {
  if (!newName || newName === oldName) return;
  if (State.editingDesignSystem.colors) {
    const value = State.editingDesignSystem.colors[oldName];
    delete State.editingDesignSystem.colors[oldName];
    State.editingDesignSystem.colors[newName] = value;
    renderDesignColors();
    updateDesignSystemJson();
  }
}

function editDesignColor(name) {
  // 已不再使用，保留以防旧代码调用
  const currentValue = State.editingDesignSystem.colors[name];
  const newValue = prompt(`编辑颜色 "${name}":`, currentValue);
  if (newValue !== null) {
    State.editingDesignSystem.colors[name] = newValue.trim();
    renderDesignColors();
    updateDesignSystemJson();
  }
}

function removeDesignColor(name) {
  if (confirm(`确定删除颜色 "${name}"？`)) {
    delete State.editingDesignSystem.colors[name];
    renderDesignColors();
    updateDesignSystemJson();
  }
}

function addPickedColorsToDesign() {
  if (State.pickedColors.length === 0) {
    showToast('没有已取的颜色');
    return;
  }

  if (!State.editingDesignSystem.colors) {
    State.editingDesignSystem.colors = {};
  }

  // 为每个取到的颜色添加到设计系统
  let addedCount = 0;
  for (const color of State.pickedColors) {
    // 生成颜色名称（color1, color2, ...）
    let baseName = 'color';
    let index = 1;
    let name = baseName + index;
    while (State.editingDesignSystem.colors[name]) {
      index++;
      name = baseName + index;
    }
    State.editingDesignSystem.colors[name] = color;
    addedCount++;
  }

  // 清空已取颜色
  State.pickedColors = [];
  updatePickedColorsDisplay();
  renderDesignColors();
  updateDesignSystemJson();
  showToast(`已添加 ${addedCount} 个颜色`);
}

function updateDesignSpacing() {
  if (!State.editingDesignSystem.spacing) {
    State.editingDesignSystem.spacing = {};
  }
  const getValue = (id) => {
    const val = document.getElementById(id).value;
    return val ? parseInt(val, 10) : undefined;
  };
  const spacing = {
    xs: getValue('spacingXs'),
    sm: getValue('spacingSm'),
    md: getValue('spacingMd'),
    lg: getValue('spacingLg'),
    xl: getValue('spacingXl')
  };
  // 移除 undefined 值
  Object.keys(spacing).forEach(k => spacing[k] === undefined && delete spacing[k]);
  State.editingDesignSystem.spacing = spacing;
  updateDesignSystemJson();
}

function updateDesignRadius() {
  if (!State.editingDesignSystem.radius) {
    State.editingDesignSystem.radius = {};
  }
  const getValue = (id) => {
    const val = document.getElementById(id).value;
    return val ? parseInt(val, 10) : undefined;
  };
  const radius = {
    sm: getValue('radiusSm'),
    md: getValue('radiusMd'),
    lg: getValue('radiusLg'),
    xl: getValue('radiusXl')
  };
  // 移除 undefined 值
  Object.keys(radius).forEach(k => radius[k] === undefined && delete radius[k]);
  State.editingDesignSystem.radius = radius;
  updateDesignSystemJson();
}

function updateDesignSystemJson() {
  document.getElementById('designSystemJson').value = JSON.stringify(State.editingDesignSystem, null, 2);
}

function parseDesignSystemJson() {
  const jsonStr = document.getElementById('designSystemJson').value.trim();
  if (!jsonStr) {
    State.editingDesignSystem = {};
    renderDesignSystemForm();
    showToast('已清空设计系统');
    return;
  }

  try {
    State.editingDesignSystem = JSON.parse(jsonStr);
    renderDesignSystemForm();
    showToast('JSON 解析成功');
  } catch (e) {
    showToast('JSON 格式错误: ' + e.message);
  }
}

async function saveDesignSystem() {
  const projectId = State.editingDesignProjectId;
  if (!projectId) {
    showToast('未选择项目');
    return;
  }

  const project = State.config.projects.find(p => p.id === projectId);
  if (!project) {
    showToast('项目不存在');
    return;
  }

  try {
    // 合并现有设计系统和新的编辑内容
    const designSystem = State.editingDesignSystem || {};

    await API.updateProject(projectId, project.name, project.description, designSystem);

    // 更新本地状态
    project.designSystem = designSystem;

    closeDesignSystemDrawer();
    showToast('设计系统已保存');
  } catch (e) {
    showToast('保存失败: ' + e.message);
  }
}

// ==================== 分组管理 ====================

function createGroup() {
  State.editingGroupId = null;
  document.getElementById('groupName').value = '';
  document.getElementById('groupDescription').value = '';
  document.getElementById('groupRoute').value = '';
  document.getElementById('groupSourcePathFlutter').value = '';
  document.getElementById('groupSourcePathRN').value = '';
  document.getElementById('groupSourcePathUniapp').value = '';
  UI.renderGroupColorPicker();
  UI.showModal('groupModal');
}

function groupSelected() {
  if (State.selectedFiles.size === 0) return;
  createGroup();
}

function selectGroupColor(el) {
  document.querySelectorAll('#groupColorPicker .color-option').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
}

function confirmGroup() {
  const name = document.getElementById('groupName').value.trim();
  if (!name) {
    showToast('请输入分组名称');
    return;
  }

  const selectedColor = document.querySelector('#groupColorPicker .color-option.selected');
  const color = selectedColor ? selectedColor.dataset.color : State.groupColors[0];

  const sourcePaths = {
    flutter: document.getElementById('groupSourcePathFlutter').value,
    'react-native': document.getElementById('groupSourcePathRN').value,
    uniapp: document.getElementById('groupSourcePathUniapp').value
  };

  if (State.editingGroupId) {
    State.updateGroup(State.editingGroupId, {
      name: name,
      description: document.getElementById('groupDescription').value,
      route: document.getElementById('groupRoute').value,
      sourcePaths: sourcePaths,
      color: color
    });
  } else {
    const groupId = 'group_' + Date.now();
    State.addGroup({
      id: groupId,
      name: name,
      description: document.getElementById('groupDescription').value,
      route: document.getElementById('groupRoute').value,
      sourcePaths: sourcePaths,
      color: color
    });

    if (State.selectedFiles.size > 0) {
      State.assignSelectedFilesToGroup(groupId);
      UI.updateSelectionToolbar();
    }
  }

  closeGroupModal();
  UI.renderFileList();
  showToast(State.editingGroupId ? '分组已更新' : '分组创建成功');
}

function editGroup(groupId) {
  const group = State.pagesConfig.pageGroups.find(g => g.id === groupId);
  if (!group) return;

  State.editingGroupId = groupId;
  document.getElementById('groupName').value = group.name;
  document.getElementById('groupDescription').value = group.description || '';
  document.getElementById('groupRoute').value = group.route || '';

  // 兼容旧数据格式 (appSourcePath) 和新格式 (sourcePaths)
  const sourcePaths = group.sourcePaths || {};
  document.getElementById('groupSourcePathFlutter').value = sourcePaths.flutter || group.appSourcePath || '';
  document.getElementById('groupSourcePathRN').value = sourcePaths['react-native'] || '';
  document.getElementById('groupSourcePathUniapp').value = sourcePaths.uniapp || '';

  UI.renderGroupColorPicker(group.color);
  UI.showModal('groupModal');
}

function deleteGroup(groupId) {
  if (!confirm('确定删除此分组？文件将变为未分组状态。')) return;
  State.deleteGroup(groupId);
  UI.renderFileList();
  showToast('分组已删除');
}

function closeGroupModal() {
  UI.closeModal('groupModal');
  State.editingGroupId = null;
}

// ==================== 项目选择器 ====================

function showProjectSelector() {
  UI.renderProjectList();
  // 清空创建表单
  document.getElementById('newProjectName').value = '';
  document.getElementById('newProjectDescription').value = '';
  document.getElementById('newProjectDesignSystem').value = '';
  document.getElementById('newProjectZip').value = '';
  document.getElementById('zipFileName').textContent = '未选择文件';
  State.editingProjectId = null;
  updateProjectFormTitle();
  UI.showModal('projectModal');
}

function closeProjectModal() {
  UI.closeModal('projectModal');
  State.editingProjectId = null;
}

function updateProjectFormTitle() {
  const title = document.getElementById('projectFormTitle');
  const submitBtn = document.getElementById('projectSubmitBtn');
  if (State.editingProjectId) {
    title.textContent = '编辑项目';
    submitBtn.textContent = '保存';
  } else {
    title.textContent = '创建新项目';
    submitBtn.textContent = '创建';
  }
}

async function switchToProject(projectId) {
  // resetZoom
  resetZoom()
  const screen = document.getElementById('phoneScreen');
  screen.innerHTML = `<div class="empty-preview">
    <div class="empty-preview-icon">
      <icon-component name="fileEmpty" size="xl"></icon-component>
    </div>
    <p>选择 HTML 文件预览</p>
  </div>`;
  // 释放旧项目的编辑会话
  const oldProjectId = State.getCurrentProjectId();
  if (oldProjectId && oldProjectId !== projectId) {
    State.stopHeartbeat();
    await API.releaseSession(oldProjectId, State.getSessionId());
  }

  // 切换项目
  State.setCurrentProjectId(projectId);
  UI.updateProjectDisplay();
  closeProjectModal();

  // 注册新项目的编辑会话
  await registerEditSession();
  await loadPages();
  await scanHtmlFiles();
  showToast('已切换项目');
}

async function createOrUpdateProject() {
  const name = document.getElementById('newProjectName').value.trim();
  const description = document.getElementById('newProjectDescription').value.trim();
  const designSystemStr = document.getElementById('newProjectDesignSystem').value.trim();
  const zipInput = document.getElementById('newProjectZip');
  const zipFile = zipInput.files[0];

  if (!name) {
    showToast('请输入项目名称');
    return;
  }

  // 解析设计系统 JSON
  let designSystem = null;
  if (designSystemStr) {
    try {
      designSystem = JSON.parse(designSystemStr);
    } catch (e) {
      showToast('设计系统 JSON 格式错误');
      return;
    }
  }

  try {
    if (State.editingProjectId) {
      // 更新项目
      await API.updateProject(State.editingProjectId, name, description, designSystem);
      showToast('项目已更新');
    } else {
      // 创建项目
      if (!zipFile) {
        showToast('请选择 HTML ZIP 文件');
        return;
      }
      const result = await API.createProject(name, description, zipFile);
      // 创建成功后自动切换到新项目
      if (result.project && result.project.id) {
        // 释放旧项目的会话
        const oldProjectId = State.getCurrentProjectId();
        if (oldProjectId) {
          State.stopHeartbeat();
          await API.releaseSession(oldProjectId, State.getSessionId());
        }
        State.setCurrentProjectId(result.project.id);
        // 如果有设计系统，更新项目
        if (designSystem) {
          await API.updateProject(result.project.id, name, description, designSystem);
        }
      }
      showToast('项目创建成功');
      closeProjectModal();
    }

    await loadConfig();
    UI.renderProjectList();
    // 注册新项目的编辑会话
    await registerEditSession();
    await loadPages();
    await scanHtmlFiles();
    UI.updateProjectDisplay();

    // 清空表单
    document.getElementById('newProjectName').value = '';
    document.getElementById('newProjectDescription').value = '';
    document.getElementById('newProjectDesignSystem').value = '';
    document.getElementById('newProjectZip').value = '';
    document.getElementById('zipFileName').textContent = '未选择文件';
    State.editingProjectId = null;
    updateProjectFormTitle();
  } catch (e) {
    showToast('操作失败: ' + e.message);
  }
}

function editProject(projectId) {
  const project = State.config.projects.find(p => p.id === projectId);
  if (!project) return;

  State.editingProjectId = projectId;
  document.getElementById('newProjectName').value = project.name;
  document.getElementById('newProjectDescription').value = project.description || '';
  document.getElementById('newProjectDesignSystem').value = project.designSystem ? JSON.stringify(project.designSystem, null, 2) : '';
  document.getElementById('newProjectZip').value = '';
  document.getElementById('zipFileName').textContent = '无需重新上传';
  updateProjectFormTitle();
}

async function replaceProjectHtml(projectId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.zip';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      showToast('正在上传...');
      await API.replaceProjectHtml(projectId, file);
      showToast('HTML 已替换');
      await scanHtmlFiles();
    } catch (err) {
      showToast('替换失败: ' + err.message);
    }
  };
  input.click();
}

async function deleteProject(projectId) {
  if (!confirm('确定删除此项目？所有相关数据将被删除。')) return;

  try {
    const currentProjectId = State.getCurrentProjectId();
    await API.deleteProject(projectId);

    // 如果删除的是当前项目，清除并选择其他项目
    if (currentProjectId === projectId) {
      State.setCurrentProjectId(null);
    }

    await loadConfig();
    UI.renderProjectList();
    UI.updateProjectDisplay();
    await loadPages();
    await scanHtmlFiles();
    showToast('项目已删除');
  } catch (e) {
    showToast('删除失败: ' + e.message);
  }
}

function handleZipSelect(input) {
  const fileName = input.files[0]?.name || '未选择文件';
  document.getElementById('zipFileName').textContent = fileName;
}

// ==================== 提示词生成 ====================

function showPromptModal() {
  UI.showModal('promptModal');
  generatePrompt();
}

function closePromptModal() {
  UI.closeModal('promptModal');
}

async function generatePrompt() {
  const platform = document.getElementById('targetPlatform').value;
  const project = State.getCurrentProject();
  const designSystem = project?.designSystem || null;

  try {
    const data = await API.generatePrompt({
      pages: State.pagesConfig,
      targetPlatform: platform,
      designSystem: designSystem
    });
    document.getElementById('promptPreview').textContent = data.prompt;
  } catch (e) {
    showToast('生成失败');
  }
}

function copyPrompt() {
  const text = document.getElementById('promptPreview').textContent;
  navigator.clipboard.writeText(text);
  showToast('已复制到剪贴板');
}

function downloadPrompt() {
  const text = document.getElementById('promptPreview').textContent;
  const blob = new Blob([text], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pages-prompt.md';
  a.click();
  URL.revokeObjectURL(url);
}

// ==================== 配置下载 ====================

function downloadPagesConfig() {
  const projectId = State.getCurrentProjectId();
  if (!projectId) {
    showToast('请先选择项目');
    return;
  }

  const config = State.pagesConfig;
  const jsonStr = JSON.stringify(config, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pages-config.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('配置已下载');
}

// ==================== WebSocket ====================

function initWebSocket() {
  const ws = new WebSocket(`ws://${location.host}`);
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'reload') {
      scanHtmlFiles();
      if (State.currentFile) {
        UI.previewHtml(State.currentFile.path);
      }
    }
  };
  ws.onclose = () => setTimeout(initWebSocket, 3000);
}

// ==================== 事件监听 ====================

function initEventListeners() {
  // 面板切换
  document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const panel = tab.dataset.panel;
      document.getElementById('filePanel').style.display = panel === 'file' ? 'block' : 'none';
      document.getElementById('analysisPanel').style.display = panel === 'analysis' ? 'block' : 'none';
    });
  });

  // 设备切换
  document.querySelectorAll('.device-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.device-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const screen = document.querySelector('.phone-screen');
      screen.style.width = btn.dataset.width + 'px';
      screen.style.height = btn.dataset.height + 'px';
    });
  });

  // 表单自动更新
  ['fileStateName', 'fileDescription', 'fileGroup'].forEach(id => {
    document.getElementById(id).addEventListener('change', updateCurrentFile);
  });
}

// ==================== 缩放控制 ====================

let currentZoom = 1;

/**
 * 设置缩放级别 - 通过调整iframe尺寸和scale实现viewport缩放
 * @param {number|string} value - 缩放值 (0.25 ~ 1.5)
 */
function setZoom(value) {
  currentZoom = parseFloat(value);
  currentZoom = Math.max(0.25, Math.min(1.5, currentZoom));

  const iframe = document.getElementById('previewFrame');
  const screen = document.querySelector('.phone-screen');

  if (iframe && screen) {
    // 获取当前设备尺寸
    const deviceWidth = parseInt(screen.style.width) || 375;
    const deviceHeight = parseInt(screen.style.height) || 812;

    // 计算iframe实际尺寸 (反向缩放)
    const iframeWidth = deviceWidth / currentZoom;
    const iframeHeight = deviceHeight / currentZoom;

    // 设置iframe尺寸并使用transform缩放回来
    iframe.style.width = iframeWidth + 'px';
    iframe.style.height = iframeHeight + 'px';
    iframe.style.transform = `scale(${currentZoom})`;
    iframe.style.transformOrigin = 'top left';
  }

  // 更新UI显示
  document.getElementById('zoomSlider').value = currentZoom;
  document.getElementById('zoomValue').textContent = Math.round(currentZoom * 100) + '%';
}

/**
 * 调整缩放级别
 * @param {number} delta - 变化量
 */
function adjustZoom(delta) {
  setZoom(currentZoom + delta);
}

/**
 * 重置缩放到100%
 */
function resetZoom() {
  setZoom(1);
}

// 启动应用
init();
