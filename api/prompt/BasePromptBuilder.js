/**
 * 提示词生成 - 基础 Builder
 *
 * 采用 fluent builder 模式：每个段落是一个返回 this 的方法，
 * 子类只需覆盖 3 个 hook 即可适配新平台：
 *   - getPlatformConfig()           平台元信息（框架、语言、资源目录等）
 *   - getRoutingGuide()             路由管理段
 *   - getTabbarImplementation(tabs) Tabbar 实现建议段
 */

class BasePromptBuilder {
  constructor(pagesConfig, designSystem, statusFilters) {
    this.pagesConfig = pagesConfig || {};
    this.designSystem = designSystem;
    this.statusFilters = statusFilters;
    this.parts = [];
    this.guide = this.getPlatformConfig();
  }

  // ============ 子类必须覆盖的 hook ============
  getPlatformConfig() {
    throw new Error('getPlatformConfig() must be implemented by subclass');
  }
  getRoutingGuide() {
    throw new Error('getRoutingGuide() must be implemented by subclass');
  }
  /** 子类可选覆盖：返回 Tabbar 平台实现建议（包括前置换行） */
  getTabbarImplementation(_tabbarItems) {
    return '';
  }

  // ============ 工具方法 ============
  _shouldIncludeFile(file) {
    if (!this.statusFilters || this.statusFilters.length === 0) return true;
    const fileStatus = file.devStatus || 'pending';
    return this.statusFilters.includes(fileStatus);
  }

  _formatRegion(region) {
    if (!region) return '';
    const r = region.device || region;
    if (!r) return '';
    let text = ` [区域: ${r.x},${r.y},${r.width},${r.height}]`;
    if (region.image) {
      const img = region.image;
      text += ` (图像像素: ${img.x},${img.y},${img.width},${img.height})`;
    }
    return text;
  }

  _getTabRoute(file, groups) {
    if (file.groupId && groups) {
      const group = groups.find(g => g.id === file.groupId);
      if (group && group.route) return group.route;
    }
    return '待定义';
  }

  _collectTabbarItems() {
    return (this.pagesConfig.htmlFiles || [])
      .filter(f => f.isTabbarPage && f.tabIndex)
      .sort((a, b) => a.tabIndex - b.tabIndex)
      .map(f => ({
        index: f.tabIndex,
        name: f.tabName || f.stateName || '未命名',
        iconDefault: f.tabIconDefault || '',
        iconSelected: f.tabIconSelected || '',
        route: this._getTabRoute(f, this.pagesConfig.pageGroups),
      }));
  }

  _hasImageFiles() {
    return (this.pagesConfig.htmlFiles || [])
      .some(f => f.sourceType === 'image' || f.sourceType === 'psd' || f.imagePath);
  }

  _push(text) {
    this.parts.push(text);
    return this;
  }

  // ============ 段落方法（fluent） ============
  header() {
    const g = this.guide;
    return this._push(`# ${this.pagesConfig.projectName || 'App'} - 页面开发指南

## 目标平台
- 框架: ${g.framework}
- 语言: ${g.language}
- 布局组件: ${g.layoutWidget}
- 状态管理: ${g.stateManagement}
- 路由管理: ${g.routing}

`);
  }

  importantNotes() {
    const g = this.guide;
    return this._push(`## ⚠️ 重要注意事项

### 必须忽略的元素
1. **手机状态栏（Status Bar）**：HTML设计稿中顶部的手机状态栏（显示时间、信号、电池等）是设计稿的装饰元素，**不要**在代码中实现，系统会自动处理状态栏。
2. **手机导航栏（Navigation Bar）**：底部的系统导航栏同样忽略。
3. **设备边框**：任何模拟手机外框的元素都要忽略。

### 图片资源处理
在生成代码时，请按以下规则处理图片资源：
1. 检测 HTML 中所有引用的图片（img 标签、background-image 等）
2. 将图片文件复制到项目的 \`${g.assetsDir}\` 目录
3. 图片文件重命名规则：保持原文件名，如有冲突则添加序号后缀
4. 在代码中使用正确的资源引用方式: \`${g.imageAsset}\`
5. **PSD 切图**：若提供了 PSD 切图，将切图文件一并复制到 \`${g.assetsDir}\`，并在代码中使用切图替代对应区域的 HTML/CSS 还原

### 页面状态与"主状态"约定
- 一个**页面分组**代表一个逻辑页面，其下可能包含多个状态文件（如：默认、加载中、空数据、错误、提交成功等）
- 同一分组内的多个状态**必须在同一个页面文件中通过条件渲染/状态切换实现**，不要为每个状态分别创建新页面或新路由
- 标注为 **主状态** 的文件是该分组的入口/默认呈现，应作为页面的主实现依据（布局、骨架、初始 UI 以此为准）
- 主状态在每个分组的"页面状态"列表中**位于首位**；若未显式标注，可将列表首项视作主状态
- 其他状态文件描述的是同一页面在不同条件下的视觉差异，实现时应抽取出状态变量（如 \`loading\` / \`empty\` / \`error\`）来驱动 UI 切换

`);
  }

  routingGuide() {
    return this._push(`${this.getRoutingGuide()}\n\n`);
  }

  designSystemSection() {
    if (!this.designSystem || Object.keys(this.designSystem).length === 0) return this;
    return this._push(`## 设计系统
\`\`\`json
${JSON.stringify(this.designSystem, null, 2)}
\`\`\`

`);
  }

  designImageFlow() {
    if (!this._hasImageFiles()) return this;
    return this._push(`## 设计图模式流程
1. 对每个标记为“设计图”的页面，先依据 \`UI-IR-AGENT.md\` 生成 UI IR(HTML)
2. 以 UI IR(HTML) 为准实现页面布局与样式，必要时补全缺失信息
3. 如与设计图有偏差，优先修正布局、尺寸与对齐

## UI-IR-AGENT 规范
请将 \`UI-IR-AGENT.md\` 放在项目根目录，并在生成 UI IR(HTML) 时作为严格规则引用。

## UI IR 固定提示词（PNG → IR）
你是 UI IR 解析器。请根据设计图生成 UI IR(HTML)，用于后续生成 ${this.guide.framework} 代码。
输入设计图信息从页面列表中读取（路径与页面名）。
输出要求：
1. 只输出严格 HTML，不要解释文字。
2. 坐标与尺寸使用 px，基于设备内容区。
3. 包含层级结构、布局、样式、文本、图片、列表/Tabbar 等。
4. 对不确定元素在 HTML 元素上标注 \`data-confidence\` 与 \`data-notes\`。

`);
  }

  tabbar() {
    const items = this._collectTabbarItems();
    if (items.length === 0) return this;

    let out = `## Tabbar 配置

应用底部有 ${items.length} 个 Tab 页面：

| Tab序号 | 名称 | 默认图标 | 选中图标 | 路由 |
|--------|------|---------|---------|------|
`;
    for (const tab of items) {
      out += `| ${tab.index} | ${tab.name} | \`${tab.iconDefault || '待配置'}\` | \`${tab.iconSelected || '待配置'}\` | \`${tab.route}\` |\n`;
    }
    out += this.getTabbarImplementation(items);
    out += '\n';
    return this._push(out);
  }

  /** 渲染单个文件的详情（refLabel/路径/描述/PSD切图/交互/切图标记/功能描述/数据加载） */
  _renderFile(file, opts) {
    const { headerLine, subIndent, htmlLabel, emptyDescription } = opts;
    let out = headerLine + '\n';

    const isPsd = file.sourceType === 'psd';
    const isImage = file.sourceType === 'image' || file.imagePath;
    const isDesignRef = isPsd || isImage;
    const refLabel = isPsd ? 'PSD设计图' : (isImage ? '设计图' : htmlLabel);
    const refPath = isPsd
      ? (file.previewPath || file.imagePath || file.path)
      : (isImage ? (file.imagePath || file.path) : file.path);

    out += `${subIndent}- ${refLabel}: \`${refPath}\`\n`;
    out += `${subIndent}- 描述: ${file.description || emptyDescription}\n`;

    if (isDesignRef) {
      out += `${subIndent}- 说明: 先根据设计图生成 UI IR(HTML)，再基于 UI IR 实现代码\n`;
    }

    // PSD 切图
    if (isPsd && file.psdSlices && file.psdSlices.length > 0) {
      const psdBaseName = file.path.split('/').pop().replace(/\.psd$/i, '');
      const slicesDir = `__psd__/${psdBaseName}_slices`;
      out += `${subIndent}- PSD 切图（共 ${file.psdSlices.length} 个，导出后可直接作为资源使用）:\n`;
      for (const slice of file.psdSlices) {
        const sourceType = slice.source === 'crop' ? '框选裁剪' : '图层合成';
        const layers = slice.layerNames && slice.layerNames.length > 0 ? ` (图层: ${slice.layerNames.join(', ')})` : '';
        const slicePath = `${slicesDir}/${slice.name}.png`;
        out += `${subIndent}  - **${slice.name}** [${slice.width}×${slice.height}, 位置: ${slice.left},${slice.top}] 格式: png | 来源: ${sourceType} | 路径: \`${slicePath}\`${layers}\n`;
      }
    }

    // 交互
    if (file.interactions && file.interactions.length > 0) {
      out += `${subIndent}- 交互:\n`;
      for (const i of file.interactions) {
        const regionText = this._formatRegion(i.region);
        out += `${subIndent}  - \`${i.selector}\`${regionText} [${i.eventType}]: ${i.action}\n`;
      }
    }

    // 切图标记
    if (file.imageReplacements && file.imageReplacements.length > 0) {
      out += `${subIndent}- 切图标记:\n`;
      for (const img of file.imageReplacements) {
        const desc = img.description ? ` (${img.description})` : '';
        const regionText = this._formatRegion(img.region);
        out += `${subIndent}  - \`${img.selector}\`${regionText} → 切图 \`${img.imagePath || '待指定'}\`${desc}\n`;
      }
    }

    // 功能描述
    if (file.functionDescriptions && file.functionDescriptions.length > 0) {
      out += `${subIndent}- 功能描述（这些元素并非静态展示，需要实现对应的功能）:\n`;
      for (const func of file.functionDescriptions) {
        const regionText = this._formatRegion(func.region);
        out += `${subIndent}  - \`${func.selector}\`${regionText}: ${func.description || '待描述'}\n`;
      }
    }

    // 数据加载
    if (file.dataSources && file.dataSources.length > 0) {
      const timingLabels = {
        onInit: '页面初始化',
        onRefresh: '下拉刷新',
        onLoadMore: '上拉加载更多',
        onFocus: '页面获得焦点',
        manual: '手动触发',
      };
      const labelIndent = `${subIndent}    `;
      const codeIndent = `${subIndent}      `;
      const renderSample = (label, sample) => {
        if (!sample) return '';
        const body = sample.split('\n').map(l => `${codeIndent}${l}`).join('\n');
        return `${labelIndent}- ${label}:\n${codeIndent}\`\`\`json\n${body}\n${codeIndent}\`\`\`\n`;
      };
      out += `${subIndent}- 数据加载:\n`;
      for (const ds of file.dataSources) {
        out += `${subIndent}  - **${ds.name || '未命名'}** [${timingLabels[ds.timing] || ds.timing}]: \`${ds.method || 'GET'} ${ds.apiPath || '/api/xxx'}\`\n`;
        out += renderSample('请求样本', ds.requestSample);
        out += renderSample('响应样本', ds.responseSample);
      }
    }

    return out;
  }

  pages() {
    const groups = this.pagesConfig.pageGroups || [];
    if (groups.length === 0) return this;

    let out = `## 页面列表\n\n`;
    let hasAny = false;

    for (const group of groups) {
      const groupFiles = (this.pagesConfig.htmlFiles || [])
        .filter(f => f.groupId === group.id && this._shouldIncludeFile(f));
      if (groupFiles.length === 0) continue;
      // 主状态置顶（稳定排序：仅把主状态前移）
      groupFiles.sort((a, b) => (b.isPrimaryState ? 1 : 0) - (a.isPrimaryState ? 1 : 0));

      let sourcePath = '待创建';
      if (group.sourcePaths && group.sourcePaths[this.guide.platform]) {
        sourcePath = group.sourcePaths[this.guide.platform];
      } else if (group.appSourcePath) {
        sourcePath = group.appSourcePath;
      }
      const sourceNote = sourcePath === '待创建'
        ? ` ⚠️ 需要使用 \`${this.guide.createPageCmd}\` 创建`
        : '';

      out += `### ${group.name}
- **描述**: ${group.description || '无'}
- **路由**: \`${group.route || '待定义'}\`
- **源码路径**: \`${sourcePath}\`${sourceNote}

#### 页面状态
`;
      for (const file of groupFiles) {
        const stateLabel = file.isPrimaryState
          ? (file.stateName ? `主状态 · ${file.stateName}` : '主状态（默认）')
          : (file.stateName || file.name);
        out += this._renderFile(file, {
          headerLine: `- **${stateLabel}**`,
          subIndent: '  ',
          htmlLabel: 'HTML参考',
          emptyDescription: '',
        });
      }
      out += '\n---\n\n';
      hasAny = true;
    }

    if (!hasAny) return this;
    return this._push(out);
  }

  ungrouped() {
    const files = (this.pagesConfig.htmlFiles || [])
      .filter(f => !f.groupId && this._shouldIncludeFile(f));
    if (files.length === 0) return this;

    let out = `## 其他页面（未分组）\n\n`;
    for (const file of files) {
      out += this._renderFile(file, {
        headerLine: `### ${file.stateName || file.name}`,
        subIndent: '',
        htmlLabel: 'HTML',
        emptyDescription: '待补充',
      });
      out += '\n';
    }
    return this._push(out);
  }

  devGuide() {
    const g = this.guide;
    return this._push(`
## 开发指引

1. **严格按照HTML设计稿还原UI**：布局、颜色、字体、间距等视觉元素
2. **忽略状态栏**：不要实现HTML中的手机状态栏元素（时间、信号、电池图标等）
3. **状态切换**：同一页面的不同状态使用条件渲染实现
4. **交互实现**：根据交互描述实现点击、滑动等事件处理
5. **图片资源**：自动检测并复制图片到 \`${g.assetsDir}\`，使用正确的引用方式
6. **切图标记**：对于标记了“切图标记”的元素，不要还原 HTML 中的内容，直接使用指定的切图替换该区域
7. **PSD 切图**：若提供了 PSD 切图列表，必须使用切图文件作为图片资源，不要尝试用代码还原切图对应区域的内容，切图路径参考页面列表中给出的路径
8. **功能描述**：标记了“功能描述”的元素并非静态展示，需要根据描述实现对应的功能（如摄像头拍摄、扫码、地图显示等原生功能）
9. **数据加载**：根据数据加载配置实现 HTTP API 调用，注意触发时机（页面初始化、下拉刷新、上拉加载更多等）
10. **响应式**：考虑不同屏幕尺寸的适配
11. **路由创建**：如果源码路径不存在，使用 \`${g.createPageCmd}\` 创建

## 使用说明

将此提示词与对应的HTML文件或设计图一起提供给AI工具（如Cursor），AI将根据设计稿生成${g.framework}代码。
`);
  }

  /** 默认顺序拼装所有段落 */
  buildAll() {
    return this
      .header()
      .importantNotes()
      .routingGuide()
      .designSystemSection()
      .designImageFlow()
      .tabbar()
      .pages()
      .ungrouped()
      .devGuide();
  }

  toString() {
    return this.parts.join('');
  }
}

module.exports = BasePromptBuilder;
