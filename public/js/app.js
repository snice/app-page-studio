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

/**
 * 筛选文件列表
 */
function filterFileList() {
  State.fileFilter.searchText = document.getElementById('fileSearchInput').value.trim().toLowerCase();
  UI.renderFileList();
}

/**
 * 设置开发状态筛选
 * @param {string} status - 'all', 'pending', 'developing', 'completed'
 */
function setStatusFilter(status) {
  State.fileFilter.devStatus = status;
  // 更新按钮状态
  document.querySelectorAll('.status-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === status);
  });
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
    UI.renderDataSourceList();
  }
}

function cancelSelection() {
  State.clearSelection();
  UI.updateSelectionToolbar();
  UI.renderFileList();
}

// ==================== 页面配置 ====================

function updateCurrentFile() {
  if (!State.currentFile) return;

  // 获取 radio group 的值
  const devStatusRadio = document.querySelector('#fileDevStatus input[name="devStatus"]:checked');
  const devStatus = devStatusRadio ? devStatusRadio.value : 'pending';

  // 获取 Tabbar 配置
  const isTabbarPage = document.getElementById('isTabbarPage').checked;

  State.updateCurrentFile({
    stateName: document.getElementById('fileStateName').value,
    description: document.getElementById('fileDescription').value,
    devStatus: devStatus,
    groupId: document.getElementById('fileGroup').value || null,
    isTabbarPage: isTabbarPage,
    tabIndex: isTabbarPage ? parseInt(document.getElementById('tabIndex').value) || null : null,
    tabName: isTabbarPage ? document.getElementById('tabName').value || null : null,
    tabIconDefault: isTabbarPage ? document.getElementById('tabIconDefault').value || null : null,
    tabIconSelected: isTabbarPage ? document.getElementById('tabIconSelected').value || null : null
  });

  UI.renderFileList();
}

/**
 * 切换 Tabbar 配置显示
 */
function toggleTabbarConfig() {
  const isChecked = document.getElementById('isTabbarPage').checked;
  document.getElementById('tabbarConfigFields').style.display = isChecked ? 'block' : 'none';
  updateCurrentFile();
}

// function addInteraction() {
//   if (!State.currentFile) {
//     showToast('请先选择文件');
//     return;
//   }

//   State.addInteraction({
//     selector: '',
//     eventType: 'tap',
//     action: ''
//   });

//   UI.renderInteractionList();
// }

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
    <div class="picker-menu-item" onclick="handlePickerAction('function', '${selector}', '${eventType}')">
      <span>${UI.icon('info', 'sm')}</span>
      <span>功能描述</span>
    </div>
    <div class="picker-menu-item" onclick="handlePickerAction('styles', '${selector}', '${eventType}')">
      <span>${UI.icon('code', 'sm')}</span>
      <span>查看样式</span>
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
  } else if (action === 'function') {
    addFunctionDescriptionFromElement(selector);
  } else if (action === 'styles') {
    showElementStylesPanel(selector);
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

function updateImageReplacement(index, field, value) {
  State.updateImageReplacement(index, field, value);
}

function removeImageReplacement(index) {
  State.removeImageReplacement(index);
  UI.renderImageReplacementList();
}

// ==================== 功能描述 ====================

/**
 * 从元素添加功能描述
 */
function addFunctionDescriptionFromElement(selector) {
  if (!State.currentFile) {
    showToast('请先选择文件');
    return;
  }

  State.addFunctionDescription({
    selector: selector,
    description: ''
  });

  UI.renderFunctionDescriptionList();
  showToast(`已添加功能描述: ${selector}`);
}

/**
 * 手动添加功能描述
 */
function addFunctionDescription() {
  if (!State.currentFile) {
    showToast('请先选择文件');
    return;
  }

  State.addFunctionDescription({
    selector: '',
    description: ''
  });

  UI.renderFunctionDescriptionList();
}

function updateFunctionDescription(index, field, value) {
  State.updateFunctionDescription(index, field, value);
}

function removeFunctionDescription(index) {
  State.removeFunctionDescription(index);
  UI.renderFunctionDescriptionList();
}

// ==================== 数据源管理 ====================

/**
 * 添加数据源
 */
function addDataSource() {
  if (!State.currentFile) {
    showToast('请先选择文件');
    return;
  }

  State.addDataSource({
    name: '',
    timing: 'onInit',
    method: 'GET',
    apiPath: '',
    description: ''
  });

  UI.renderDataSourceList();
}

/**
 * 更新数据源
 */
function updateDataSource(index, field, value) {
  State.updateDataSource(index, field, value);
}

/**
 * 删除数据源
 */
function removeDataSource(index) {
  State.removeDataSource(index);
  UI.renderDataSourceList();
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

// ==================== 查看样式 ====================

// 样式面板引用
let elementStylesPanel = null;

/**
 * 显示元素样式面板
 * @param {string} selector - 元素选择器
 */
function showElementStylesPanel(selector) {
  const el = Picker.selectedElement;
  if (!el) {
    showToast('未选中元素');
    return;
  }

  const iframe = document.getElementById('previewFrame');
  if (!iframe || !iframe.contentDocument) {
    showToast('请先选择文件预览');
    return;
  }

  const doc = iframe.contentDocument;
  const computedStyle = doc.defaultView.getComputedStyle(el);
  const tagName = el.tagName.toLowerCase();

  // 判断是否为文本元素
  const textTags = ['span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'label', 'strong', 'em', 'b', 'i', 'u', 'small', 'mark', 'del', 'ins', 'sub', 'sup', 'code', 'pre', 'blockquote', 'li', 'dt', 'dd', 'th', 'td', 'caption', 'figcaption', 'cite', 'q', 'abbr', 'time', 'var', 'samp', 'kbd'];
  const isTextElement = textTags.includes(tagName);

  // 获取元素文本内容（如果是文本元素）
  const textContent = isTextElement ? (el.textContent || '').trim().substring(0, 50) : '';

  // 提取关键样式信息
  const styleInfo = extractElementStyles(el, computedStyle, isTextElement);

  // 关闭之前的面板
  closeElementStylesPanel();

  // 创建面板
  elementStylesPanel = document.createElement('div');
  elementStylesPanel.className = 'element-styles-panel';
  elementStylesPanel.innerHTML = `
    <div class="styles-panel-header">
      <div class="styles-panel-title">
        <icon-component name="code" size="md"></icon-component>
        <span>元素样式</span>
      </div>
      <button class="modal-close" onclick="closeElementStylesPanel()">
        <icon-component name="x"></icon-component>
      </button>
    </div>
    <div class="styles-panel-body">
      <div class="styles-section">
        <div class="styles-section-title">基本信息</div>
        <div class="styles-row">
          <span class="styles-label">标签</span>
          <span class="styles-value tag-value">&lt;${tagName}&gt;</span>
        </div>
        <div class="styles-row">
          <span class="styles-label">选择器</span>
          <span class="styles-value selector-value clickable" onclick="highlightElement('${escapeAttr(selector)}')" title="点击定位元素">${selector}</span>
        </div>
        ${textContent ? `
        <div class="styles-row">
          <span class="styles-label">文本内容</span>
          <span class="styles-value text-content">${escapeHtml(textContent)}${textContent.length >= 50 ? '...' : ''}</span>
        </div>
        ` : ''}
      </div>

      ${isTextElement ? `
      <div class="styles-section">
        <div class="styles-section-title">
          <icon-component name="type" size="sm"></icon-component>
          文字样式
        </div>
        ${renderStyleRow('字体', styleInfo.fontFamily, true)}
        ${renderStyleRow('字号', styleInfo.fontSize, true)}
        ${renderStyleRow('字重', styleInfo.fontWeight, true)}
        ${renderStyleRow('行高', styleInfo.lineHeight, true)}
        ${renderStyleRow('字间距', styleInfo.letterSpacing, true)}
        ${renderColorRow('文字颜色', styleInfo.color)}
        ${renderStyleRow('对齐', styleInfo.textAlign, true)}
        ${renderStyleRow('装饰', styleInfo.textDecoration, true)}
      </div>
      ` : ''}

      <div class="styles-section">
        <div class="styles-section-title">
          <icon-component name="package" size="sm"></icon-component>
          盒模型
        </div>
        ${renderStyleRow('宽度', styleInfo.width, true)}
        ${renderStyleRow('高度', styleInfo.height, true)}
        ${renderStyleRow('内边距', styleInfo.padding, true)}
        ${renderStyleRow('外边距', styleInfo.margin, true)}
        ${renderStyleRow('边框', styleInfo.border, true)}
        ${renderStyleRow('圆角', styleInfo.borderRadius, true)}
      </div>

      <div class="styles-section">
        <div class="styles-section-title">
          <icon-component name="palette" size="sm"></icon-component>
          背景与视觉
        </div>
        ${renderColorRow('背景色', styleInfo.backgroundColor)}
        ${renderBackgroundImageRow(styleInfo.backgroundImage)}
        ${renderStyleRow('透明度', styleInfo.opacity, true)}
        ${renderStyleRow('阴影', styleInfo.boxShadow, true)}
      </div>

      <div class="styles-section">
        <div class="styles-section-title">
          <icon-component name="target" size="sm"></icon-component>
          布局
        </div>
        ${renderStyleRow('显示', styleInfo.display, true)}
        ${renderStyleRow('定位', styleInfo.position, true)}
        ${styleInfo.display === 'flex' || styleInfo.display === 'inline-flex' ? `
          ${renderStyleRow('主轴方向', styleInfo.flexDirection, true)}
          ${renderStyleRow('主轴对齐', styleInfo.justifyContent, true)}
          ${renderStyleRow('交叉轴对齐', styleInfo.alignItems, true)}
          ${renderStyleRow('间距', styleInfo.gap, true)}
        ` : ''}
        ${renderStyleRow('溢出', styleInfo.overflow, true)}
        ${renderStyleRow('层级', styleInfo.zIndex, true)}
      </div>
    </div>
  `;

  document.body.appendChild(elementStylesPanel);

  // 初始化拖拽功能
  initStylesPanelDrag(elementStylesPanel);
}

/**
 * 初始化样式面板拖拽功能
 */
function initStylesPanelDrag(panel) {
  const header = panel.querySelector('.styles-panel-header');
  if (!header) return;

  let isDragging = false;
  let startX, startY;
  let panelStartX, panelStartY;

  header.style.cursor = 'move';

  header.addEventListener('mousedown', (e) => {
    // 忽略关闭按钮点击
    if (e.target.closest('.modal-close')) return;

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    const rect = panel.getBoundingClientRect();
    panelStartX = rect.left;
    panelStartY = rect.top;

    // 移除 right 定位，改用 left
    panel.style.right = 'auto';
    panel.style.left = panelStartX + 'px';
    panel.style.top = panelStartY + 'px';

    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);

    e.preventDefault();
  });

  function onDragMove(e) {
    if (!isDragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    let newX = panelStartX + dx;
    let newY = panelStartY + dy;

    // 限制面板在可视区域内
    const panelRect = panel.getBoundingClientRect();
    const maxX = window.innerWidth - panelRect.width;
    const maxY = window.innerHeight - panelRect.height;

    newX = Math.max(0, Math.min(newX, maxX));
    newY = Math.max(0, Math.min(newY, maxY));

    panel.style.left = newX + 'px';
    panel.style.top = newY + 'px';
  }

  function onDragEnd() {
    isDragging = false;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
  }
}

/**
 * 提取元素样式
 */
function extractElementStyles(el, style, isTextElement) {
  const info = {
    // 文字样式
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    color: style.color,
    textAlign: style.textAlign,
    textDecoration: style.textDecoration,

    // 盒模型
    width: style.width,
    height: style.height,
    padding: formatBoxValue(style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft),
    margin: formatBoxValue(style.marginTop, style.marginRight, style.marginBottom, style.marginLeft),
    border: formatBorder(style),
    borderRadius: formatBorderRadius(style),

    // 背景
    backgroundColor: style.backgroundColor,
    backgroundImage: style.backgroundImage,
    opacity: style.opacity,
    boxShadow: style.boxShadow === 'none' ? 'none' : '有阴影',

    // 布局
    display: style.display,
    position: style.position,
    flexDirection: style.flexDirection,
    justifyContent: style.justifyContent,
    alignItems: style.alignItems,
    gap: style.gap,
    overflow: style.overflow,
    zIndex: style.zIndex
  };

  return info;
}

/**
 * 格式化盒模型值
 */
function formatBoxValue(top, right, bottom, left) {
  top = parseFloat(top) || 0;
  right = parseFloat(right) || 0;
  bottom = parseFloat(bottom) || 0;
  left = parseFloat(left) || 0;

  if (top === 0 && right === 0 && bottom === 0 && left === 0) {
    return '0';
  }
  if (top === right && right === bottom && bottom === left) {
    return `${top}px`;
  }
  if (top === bottom && left === right) {
    return `${top}px ${right}px`;
  }
  return `${top}px ${right}px ${bottom}px ${left}px`;
}

/**
 * 格式化边框值
 */
function formatBorder(style) {
  const width = style.borderTopWidth;
  const borderStyle = style.borderTopStyle;
  const color = style.borderTopColor;

  if (borderStyle === 'none' || parseFloat(width) === 0) {
    return 'none';
  }
  return `${width} ${borderStyle}`;
}

/**
 * 格式化圆角值
 */
function formatBorderRadius(style) {
  const tl = parseFloat(style.borderTopLeftRadius) || 0;
  const tr = parseFloat(style.borderTopRightRadius) || 0;
  const br = parseFloat(style.borderBottomRightRadius) || 0;
  const bl = parseFloat(style.borderBottomLeftRadius) || 0;

  if (tl === 0 && tr === 0 && br === 0 && bl === 0) {
    return '0';
  }
  if (tl === tr && tr === br && br === bl) {
    return `${tl}px`;
  }
  return `${tl}px ${tr}px ${br}px ${bl}px`;
}

/**
 * 渲染样式行
 */
function renderStyleRow(label, value, copyable = false) {
  if (!value || value === 'none' || value === 'normal' || value === 'auto' || value === 'static') {
    return '';
  }
  const displayValue = value.length > 30 ? value.substring(0, 30) + '...' : value;
  const copyAttr = copyable ? `onclick="copyToClipboard('${escapeAttr(value)}')" title="点击复制: ${escapeAttr(value)}"` : '';
  return `
    <div class="styles-row">
      <span class="styles-label">${label}</span>
      <span class="styles-value ${copyable ? 'copyable' : ''}" ${copyAttr}>${escapeHtml(displayValue)}</span>
    </div>
  `;
}

/**
 * 渲染颜色行（带色块）
 */
function renderColorRow(label, colorValue) {
  if (!colorValue || colorValue === 'transparent' || colorValue === 'rgba(0, 0, 0, 0)') {
    return '';
  }
  const hexColor = rgbaToHex(colorValue);
  return `
    <div class="styles-row">
      <span class="styles-label">${label}</span>
      <span class="styles-value color-value" onclick="copyToClipboard('${hexColor}')" title="点击复制: ${hexColor}">
        <span class="color-swatch" style="background:${colorValue}"></span>
        <span>${hexColor}</span>
      </span>
    </div>
  `;
}

/**
 * 渲染背景图行（带缩略图）
 */
function renderBackgroundImageRow(bgImage) {
  if (!bgImage || bgImage === 'none') {
    return '';
  }
  // 提取 URL
  const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
  if (!urlMatch) {
    return '';
  }
  const imageUrl = urlMatch[1];
  return `
    <div class="styles-row bg-image-row">
      <span class="styles-label">背景图</span>
      <span class="styles-value bg-image-value" onclick="showImagePreview('${escapeAttr(imageUrl)}')" title="点击放大查看">
        <img src="${imageUrl}" class="bg-image-thumbnail" alt="背景图" onerror="this.style.display='none'">
        <span class="bg-image-hint">点击放大</span>
      </span>
    </div>
  `;
}

/**
 * 显示图片预览弹窗
 */
function showImagePreview(imageUrl) {
  // 关闭已存在的预览
  closeImagePreview();

  const overlay = document.createElement('div');
  overlay.id = 'imagePreviewOverlay';
  overlay.className = 'image-preview-overlay';
  overlay.onclick = closeImagePreview;
  overlay.innerHTML = `
    <div class="image-preview-container" onclick="event.stopPropagation()">
      <button class="image-preview-close" onclick="closeImagePreview()">
        <icon-component name="x"></icon-component>
      </button>
      <img src="${imageUrl}" class="image-preview-img" alt="背景图预览">
    </div>
  `;
  document.body.appendChild(overlay);

  // 支持 ESC 关闭
  document.addEventListener('keydown', handleImagePreviewEsc);
}

/**
 * 关闭图片预览
 */
function closeImagePreview() {
  const overlay = document.getElementById('imagePreviewOverlay');
  if (overlay) {
    overlay.remove();
  }
  document.removeEventListener('keydown', handleImagePreviewEsc);
}

/**
 * 处理 ESC 键关闭图片预览
 */
function handleImagePreviewEsc(e) {
  if (e.key === 'Escape') {
    closeImagePreview();
  }
}

/**
 * RGBA 转 HEX
 */
function rgbaToHex(rgba) {
  const match = rgba.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (match) {
    const r = parseInt(match[1]);
    const g = parseInt(match[2]);
    const b = parseInt(match[3]);
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toLowerCase();
  }
  return rgba;
}

/**
 * HTML 转义
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * 属性值转义
 */
function escapeAttr(str) {
  return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

/**
 * 关闭元素样式面板
 */
function closeElementStylesPanel() {
  if (elementStylesPanel) {
    elementStylesPanel.remove();
    elementStylesPanel = null;
  }
  Picker.selectedElement = null;
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
  State.currentFile = null;  // 清空当前文件
  UI.updateProjectDisplay();
  closeProjectModal();

  // 清空数据管理面板
  UI.renderDataSourceList();

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

  // 获取筛选的开发状态
  const statusFilters = [];
  if (document.getElementById('filterPending').checked) statusFilters.push('pending');
  if (document.getElementById('filterDeveloping').checked) statusFilters.push('developing');
  if (document.getElementById('filterCompleted').checked) statusFilters.push('completed');

  try {
    const data = await API.generatePrompt({
      pages: State.pagesConfig,
      targetPlatform: platform,
      designSystem: designSystem,
      statusFilters: statusFilters.length > 0 ? statusFilters : null
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

      // 切换到数据管理面板时渲染数据源列表
      if (panel === 'analysis') {
        UI.renderDataSourceList();
      }
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

  // Tabbar 配置字段监听
  ['tabIndex', 'tabName', 'tabIconDefault', 'tabIconSelected'].forEach(id => {
    document.getElementById(id).addEventListener('change', updateCurrentFile);
  });

  // 开发状态 radio group 监听
  document.querySelectorAll('#fileDevStatus input[name="devStatus"]').forEach(radio => {
    radio.addEventListener('change', updateCurrentFile);
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
