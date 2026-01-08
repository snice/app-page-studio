/**
 * 主应用入口
 * 初始化和事件绑定
 */

// ==================== 初始化 ====================

async function init() {
  await loadConfig();
  await loadPages();
  await scanHtmlFiles();
  initWebSocket();
  initEventListeners();
  console.log('初始化完成, pagesConfig:', State.pagesConfig);
}

async function loadConfig() {
  const data = await API.getConfig();
  State.setConfig(data);
  UI.updateProjectDisplay();
}

async function loadPages() {
  const data = await API.getPages();
  State.setPagesConfig(data);
  console.log('loadPages 完成, pageGroups:', State.pagesConfig.pageGroups);
}

async function saveConfig() {
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

function togglePicker() {
  State.isPickerActive = !State.isPickerActive;
  const btn = document.getElementById('pickerBtn');
  btn.classList.toggle('active', State.isPickerActive);
  btn.textContent = State.isPickerActive ? '🎯 点击选择' : '🎯 选择元素';

  const iframe = document.getElementById('previewFrame');
  if (iframe && iframe.contentWindow) {
    if (State.isPickerActive) {
      Picker.enable(iframe);
    } else {
      Picker.disable(iframe);
    }
  }
}

// ==================== 分组管理 ====================

function createGroup() {
  State.editingGroupId = null;
  document.getElementById('groupName').value = '';
  document.getElementById('groupDescription').value = '';
  document.getElementById('groupRoute').value = '';
  document.getElementById('groupSourcePath').value = '';
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

  if (State.editingGroupId) {
    State.updateGroup(State.editingGroupId, {
      name: name,
      description: document.getElementById('groupDescription').value,
      route: document.getElementById('groupRoute').value,
      appSourcePath: document.getElementById('groupSourcePath').value,
      color: color
    });
  } else {
    const groupId = 'group_' + Date.now();
    State.addGroup({
      id: groupId,
      name: name,
      description: document.getElementById('groupDescription').value,
      route: document.getElementById('groupRoute').value,
      appSourcePath: document.getElementById('groupSourcePath').value,
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
  document.getElementById('groupSourcePath').value = group.appSourcePath || '';
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
  UI.renderRecentProjects();
  document.getElementById('newProjectPath').value = '';
  document.getElementById('projectBrowser').style.display = 'none';
  UI.showModal('projectModal');
}

function closeProjectModal() {
  UI.closeModal('projectModal');
}

async function switchToProject(projectPath) {
  try {
    const data = await API.switchProject(projectPath);
    if (data.success) {
      State.setConfig(data.config);
      UI.updateProjectDisplay();
      closeProjectModal();
      await loadPages();
      await scanHtmlFiles();
      showToast('已切换项目');
    }
  } catch (e) {
    showToast('切换失败');
  }
}

async function removeProject(projectPath) {
  if (!confirm('确定从列表中移除此项目？')) return;

  try {
    const data = await API.removeProject(projectPath);
    if (data.success) {
      State.setConfig(data.config);
      UI.updateProjectDisplay();
      UI.renderRecentProjects();
      if (State.config.currentProject !== projectPath) {
        // 无需重新加载
      } else {
        await loadPages();
        await scanHtmlFiles();
      }
    }
  } catch (e) {
    showToast('移除失败');
  }
}

function browseForProject() {
  State.projectBrowsePath = '/';
  document.getElementById('projectBrowser').style.display = 'block';
  browseProjectPath('/');
}

async function browseProjectPath(dirPath) {
  if (dirPath === '..') {
    const parts = State.projectBrowsePath.split('/').filter(Boolean);
    parts.pop();
    dirPath = '/' + parts.join('/');
  }
  State.projectBrowsePath = dirPath;
  document.getElementById('projectBrowserPath').value = dirPath;

  try {
    const data = await API.browse(dirPath);
    UI.renderBrowserList(data.items);
  } catch (e) {
    console.error('浏览失败', e);
  }
}

function selectProjectPath(path) {
  document.getElementById('newProjectPath').value = path;
  document.querySelectorAll('#projectBrowserList .browser-item').forEach(el => {
    el.classList.remove('selected');
  });
  event.currentTarget.classList.add('selected');
}

async function addAndSwitchProject() {
  const projectPath = document.getElementById('newProjectPath').value.trim();
  if (!projectPath) {
    showToast('请输入或选择项目路径');
    return;
  }
  await switchToProject(projectPath);
}

// ==================== 提示词生成 ====================

function showPromptModal() {
  UI.showModal('promptModal');
  document.getElementById('imageStatus').textContent = '';
  generatePrompt();
}

function closePromptModal() {
  UI.closeModal('promptModal');
}

async function generatePrompt() {
  const platform = document.getElementById('targetPlatform').value;
  const includeDesignSystem = document.getElementById('includeDesignSystem').checked;

  try {
    const data = await API.generatePrompt({
      pages: State.pagesConfig,
      targetPlatform: platform,
      includeDesignSystem: includeDesignSystem
    });
    document.getElementById('promptPreview').textContent = data.prompt;
  } catch (e) {
    showToast('生成失败');
  }
}

async function extractAndCopyImages() {
  if (!State.config.currentProject) {
    showToast('请先选择项目');
    return;
  }

  const statusEl = document.getElementById('imageStatus');
  statusEl.textContent = '正在提取图片...';

  const allImages = [];

  for (const file of State.pagesConfig.htmlFiles || []) {
    try {
      const data = await API.extractImages(file.path);
      allImages.push(...data.images);
    } catch (e) {
      console.error('提取失败:', file.path, e);
    }
  }

  const uniqueImages = [...new Map(allImages.map(i => [i.src, i])).values()];

  if (uniqueImages.length === 0) {
    statusEl.textContent = '未发现需要提取的图片';
    return;
  }

  statusEl.textContent = `发现 ${uniqueImages.length} 张图片，正在复制...`;

  const targetDir = document.getElementById('assetsDir').value || 'assets/images';
  try {
    const data = await API.copyImages(uniqueImages, targetDir);

    if (data.copied.length > 0) {
      statusEl.innerHTML = `<span style="color:var(--success)">✓ 已复制 ${data.copied.length} 张图片到 ${data.assetsDir}</span>`;
      if (data.failed.length > 0) {
        statusEl.innerHTML += `<br><span style="color:var(--warning)">⚠ ${data.failed.length} 张失败</span>`;
      }
    } else {
      statusEl.innerHTML = `<span style="color:var(--warning)">⚠ 复制失败，请检查文件路径</span>`;
    }
  } catch (e) {
    statusEl.innerHTML = `<span style="color:var(--error)">✕ 复制失败: ${e.message}</span>`;
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

// 启动应用
init();
