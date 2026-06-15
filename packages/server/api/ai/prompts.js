const path = require('path');
const { relativeFromHtml, normalizeRelPath } = require('./paths');

function buildPsdSlicesText(file) {
  const slices = Array.isArray(file?.psdSlices) ? file.psdSlices : [];
  if (slices.length === 0) return '无';
  const sourceRel = normalizeRelPath(file.previewPath || file.imagePath || file.path);
  const baseName = path.posix.basename(sourceRel, path.posix.extname(sourceRel));
  return slices.map((slice) => {
    const sourceType = slice.source === 'crop' ? '框选裁剪' : '图层合成';
    const slicePath = `__psd__/${baseName}_slices/${slice.name}.png`;
    const layers = Array.isArray(slice.layerNames) && slice.layerNames.length > 0
      ? `，图层: ${slice.layerNames.join(', ')}`
      : '';
    return `- ${slice.name}: ${slice.width}x${slice.height}, 位置 ${slice.left},${slice.top}, ${sourceType}, 路径 ${slicePath}${layers}`;
  }).join('\n');
}

function buildImageReplacementsText(file, htmlRelPath) {
  const items = Array.isArray(file?.imageReplacements) ? file.imageReplacements : [];
  if (items.length === 0) return '';
  return items.map((item, index) => {
    const image = item.region?.image || {};
    const assetPath = item.imagePath
      ? (htmlRelPath ? relativeFromHtml(htmlRelPath, item.imagePath) : item.imagePath)
      : '待指定';
    if (!Number.isFinite(Number(image.x))) {
      return `- #${index + 1} src="${assetPath}"：区域未标注${item.description ? `（${item.description}）` : ''}`;
    }
    return `- #${index + 1} src="${assetPath}" → absolute left:${image.x}px; top:${image.y}px; width:${image.width}px; height:${image.height}px${item.description ? `（${item.description}）` : ''}`;
  }).join('\n');
}

function buildSystemPrompt(uiIrSpec) {
  return `${uiIrSpec}

你运行在 App Page Studio 的在线 AI HTML Agent 中。生成物保存为 __design__/xxx/index.html 或 __psd__/xxx/index.html。

【输出格式】
- 只返回完整 HTML 文档，首字符必须是 <，以 <!doctype html> 或 <html 开头。
- 不要 Markdown、代码块、解释、思考过程、英文说明。
- CSS/JS 全部内联，不引用未创建的 ./css、./js 文件，不引用 CDN/远程脚本/远程字体/网络图片。
- 禁止 SVG（<svg>/<path>/<circle>/<rect>/<defs>/<g>/<use> 及内联 SVG 图标）。
- 禁止 pointer-events:none、user-select:none（含 -webkit/-moz/-ms 前缀），所有可见元素必须可被预览选择。

【画布与缩放】
- 使用 .page 作为设计画布：position:relative; width:设计图宽度px; height:设计图高度px; overflow:hidden; 坐标从 (0,0) 开始。
- viewport 必须 width=device-width；不得固定 width=375 或 375px 根容器。
- 推荐 Lanhu/flexible 风格：内联脚本按 document.documentElement.clientWidth / 设计图宽度 设置缩放变量；若继续用 px 坐标，外层 stage 做 transform:scale(var(--scale)); transform-origin:top left 并同步缩放后宽高；若改用 rem，必须把 px 换算成 rem。
- 禁止居中固定 #canvas（width:750px; transform-origin:top center; margin:0 auto）造成左侧留白、右侧裁切。整体缩放必须 transform-origin:top left; left:0; top:0; margin:0。

【主结构】
- 主页面按 header/profile/stats/orders/banner/tools/footer 等区块用 flex 或 grid 组织；禁止整页 absolute left/top 复刻所有内容。组件内徽标/图标叠层可少量 absolute。
- 切图位置规则见用户提示中的"必须使用的切图"。

【资源引用】
- 引用切图必须逐字复制用户提示中给出的相对路径，不得自行拼接、改名、补全文件名。
- 图标、插画、头像、横幅优先用切图；未提供切图的区域允许 div/span/img 占位。
- 引用原设计图或 PSD 切图用相对当前 index.html 的路径，如 ../xxx.png 或 ../xxx_slices/name.png。

【兜底】
- 即使识别不完整也要返回最小可预览 HTML，在 #root 的 data-notes 写明不确定点；不要回复"无法生成"。
- refine 时基于"当前 HTML"做最小必要修改，不要重写无关结构。`;
}

function buildLayoutBriefing(device) {
  return `布局基准：
- 设计画布 .page 宽 ${device.width}px、高 ${device.height}px，所有坐标从 (0,0) 开始。
- 完整还原整页内容，不得只渲染首屏或裁掉底部区域。
- 主结构 flex/grid 分块；窄屏预览时整体从左上角等比缩放，不溢出、不重叠。`;
}

function buildReplacementsBlock(file, htmlRelPath) {
  const text = buildImageReplacementsText(file, htmlRelPath);
  if (!text) return '切图标记：无';
  return `必须使用的切图（强约束，不得用 CSS/div 模拟代替）：
${text}

切图规则：
- 每条都用 <img> 引用，src 逐字复制上面给出的路径。
- left/top/width/height 是设计图原始像素，等同 .page 画布 px；<img> 必须 position:absolute 挂在 .page 下，按这些坐标精确落位，不得用 flex/grid 推算。
- 切图是透明底，禁止再叠 CSS 同款图标；该区域已有的 div/span 模拟必须删除。`;
}

function buildContextHeader({ file, sourceImageRelPath, htmlRelPath, device, imageSize }) {
  return `页面信息：
- 页面名: ${file?.stateName || file?.name || path.posix.basename(sourceImageRelPath)}
- sourceType: ${file?.sourceType || 'image'}
- 设计图: ${sourceImageRelPath}（实际尺寸 ${imageSize?.width || '未知'}x${imageSize?.height || '未知'}）
- HTML 保存路径: ${htmlRelPath}
- 设计图相对 HTML: ${relativeFromHtml(htmlRelPath, sourceImageRelPath)}
- 生成基准: ${device.width}x${device.height}（${device.source === 'image' ? '设计图实际像素' : '预览设备兜底'}）
- 描述: ${file?.description || '无'}`;
}

function buildGeneratePrompt({ file, sourceImageRelPath, htmlRelPath, device, imageSize, designSystem, existingHtml, availableAssetsText }) {
  return `请根据输入设计图生成 UI IR HTML。

${buildContextHeader({ file, sourceImageRelPath, htmlRelPath, device, imageSize })}

${buildLayoutBriefing(device)}

设计系统：
${designSystem && Object.keys(designSystem).length > 0 ? JSON.stringify(designSystem, null, 2) : '无'}

可用本地资源（不含下方切图标记里已列出的）：
${availableAssetsText || '无'}

PSD 切图：
${buildPsdSlicesText(file)}

${buildReplacementsBlock(file, htmlRelPath)}

${existingHtml ? `当前已有 HTML，请基于它更新，不要重写无关结构：\n${existingHtml}` : '当前没有已有 HTML，请生成第一版。'}

直接返回最终 HTML，第一行必须是 <!doctype html>。`;
}

function buildRefinePrompt({ file, sourceImageRelPath, htmlRelPath, device, imageSize, designSystem, currentHtml, instruction, history, availableAssetsText }) {
  const historyText = history.length > 0
    ? history.map((item) => `${item.role === 'assistant' ? 'AI' : '用户'}: ${item.content}`).join('\n')
    : '无';

  return `请根据用户反馈修正当前 UI IR HTML。

${buildContextHeader({ file, sourceImageRelPath, htmlRelPath, device, imageSize })}

${buildLayoutBriefing(device)}

设计系统：
${designSystem && Object.keys(designSystem).length > 0 ? JSON.stringify(designSystem, null, 2) : '无'}

可用本地资源（不含下方切图标记里已列出的）：
${availableAssetsText || '无'}

PSD 切图：
${buildPsdSlicesText(file)}

${buildReplacementsBlock(file, htmlRelPath)}

最近对话：
${historyText}

用户本轮反馈：
${instruction}

当前 HTML：
${currentHtml}

基于当前 HTML 做最小必要修改，直接返回完整最终 HTML，第一行必须是 <!doctype html>。`;
}

module.exports = {
  buildGeneratePrompt,
  buildRefinePrompt,
  buildSystemPrompt
};
