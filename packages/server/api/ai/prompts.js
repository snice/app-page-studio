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

function buildImageReplacementsText(file) {
  const items = Array.isArray(file?.imageReplacements) ? file.imageReplacements : [];
  if (items.length === 0) return '无';
  return items.map((item) => {
    const r = item.region?.device || item.region?.image || item.region || {};
    const region = Number.isFinite(Number(r.x))
      ? `区域 ${r.x},${r.y},${r.width},${r.height}`
      : '区域未标注';
    return `- ${item.selector || '区域'}: ${region}, 切图 ${item.imagePath || '待指定'}${item.description ? `, ${item.description}` : ''}`;
  }).join('\n');
}

function buildSystemPrompt(uiIrSpec) {
  return `${uiIrSpec}

你现在运行在 App Page Studio 的在线 AI HTML Agent 中。
必须遵守：
- 只返回完整 HTML 文档，不要 Markdown、不要代码块、不要解释。
- 输出第一个字符必须是 <，并且必须以 <!doctype html> 或 <html 开头。
- 不要输出思考过程、实现计划、英文说明、Implementation details、Let's compose 等非 HTML 文本。
- 生成物会保存为与设计图同名目录下的 index.html，例如 __design__/xxx/index.html。
- 当前接口只写入 index.html，请把 CSS/JS 内联到 HTML 中，不要引用未创建的 ./css 或 ./js 文件。
- HTML 必须可直接通过浏览器预览，避免外部依赖。
- 严禁生成任何 SVG：不要使用 <svg>、<path>、<circle>、<rect>、<defs>、<g>、<use> 等 SVG 标签，也不要内联 SVG 图标。
- 严禁生成 pointer-events: none、user-select: none 以及 -webkit/-moz/-ms-user-select: none；所有可见元素都必须能被预览区元素选择器命中。
- 图标、插画、头像、横幅等优先使用已有切图；没有切图覆盖的区域只允许用普通 HTML 元素（div/span/img）做简洁占位图块。
- 引用已有切图时必须逐字复制“可用本地资源路径”中的路径；禁止按页面名、图层名或设计稿文件名自行拼接、改名、补全资源文件名。
- 如果必须引用原设计图或 PSD 切图，使用相对当前 index.html 文件的路径，例如 ../xxx.png 或 ../xxx_slices/name.png。
- 如果后续拆分本地资源，路径约定为 ./img、./css、./js。
- 不要引用网络图片、CDN、远程字体或远程脚本。
- 页面视觉基准必须优先使用输入设计图的实际像素尺寸，不要把移动端预览设备宽高当成设计稿尺寸。
- viewport 必须使用 width=device-width；禁止输出 width=375、固定 375px 根容器或只按 812px 首屏截断。
- 推荐使用 Lanhu/flexible 风格的设计画布：.page { position: relative; width: 设计图宽度px; height: 设计图高度px; overflow: hidden; }，所有坐标从画布左上角 (0,0) 开始；通过内联 flexible 脚本按 document.documentElement.clientWidth / 设计图宽度 设置缩放变量。
- 如果样式继续使用 px 坐标，必须用外层 stage 对 .page 做 transform: scale(var(--scale)) 且 transform-origin: top left，并同步 stage 的缩放后宽高；如果只设置 html font-size，则必须把尺寸换算成 rem，否则 px 不会随 flexible 缩放。
- 严禁生成居中的固定 #canvas 结构，例如 #canvas { width: 750px; transform: scale(...); transform-origin: top center; margin: 0 auto; }。如果确实需要整体缩放，必须使用外层缩放后的 stage 承载布局高度，内层画布 transform-origin: top left，且 left: 0; top: 0; margin: 0;。
- 移动端截图和像素对比时，页面左上角必须对应设计稿 (0,0)，不得通过居中、负位移或 top-center transform 造成左侧留白、右侧裁切、截图截断。
- 主页面结构必须使用 flex 或 grid：按 header/profile/stats/orders/banner/tools/footer 等区块组织；禁止用整页 absolute left/top 定位复刻所有内容。组件内部的徽标、装饰、图标叠层可以少量 absolute。
- 根容器不得暴露未缩放的设计稿宽度给窄屏 viewport；如果根容器使用设计稿宽度，必须同步缩放根容器的视觉宽高，避免横向滚动、留白或裁切。
- 即使设计图内容识别不完整，也必须返回最小可预览 HTML，并在 #root 的 data-notes 写明不确定点；不要回复“无法生成”“需要更多信息”等说明文字。
- 对话修正时必须基于“当前 HTML”做最小必要修改，不要重写成无关结构。`;
}

function buildGeneratePrompt({ file, sourceImageRelPath, htmlRelPath, device, imageSize, designSystem, existingHtml, availableAssetsText }) {
  return `请根据输入设计图生成 UI IR HTML。

页面信息：
- 页面名: ${file?.stateName || file?.name || path.posix.basename(sourceImageRelPath)}
- sourceType: ${file?.sourceType || 'image'}
- 设计图路径: ${sourceImageRelPath}
- HTML 保存路径: ${htmlRelPath}
- 原设计图相对 HTML 路径: ${relativeFromHtml(htmlRelPath, sourceImageRelPath)}
- 设计图实际尺寸: ${imageSize?.width || '未知'}x${imageSize?.height || '未知'}
- HTML 生成基准尺寸: ${device.width}x${device.height}（${device.source === 'image' ? '来自设计图实际像素' : '未解析到图片尺寸时的预览设备兜底'}）
- 页面描述: ${file?.description || '无'}

布局要求：
- 以设计图实际尺寸完整还原整页内容，不能只生成 375x812 首屏，也不能裁掉下方订单、签到、常用工具、浮动购物车、底部导航等区域。
- 使用 flex/grid 组织主要区块，避免把 #root 和所有元素写成固定 375px + absolute 坐标。
- 使用 .page 作为设计坐标画布：position: relative; width: ${device.width}px; height: ${device.height}px; overflow: hidden; 画布左上角必须是设计稿 (0,0)。
- 可以内联 flexible 脚本设置根字号或缩放变量；使用 px 坐标时必须用 stage top-left transform 同步缩放宽高，使用 rem 时必须把设计稿 px 换算成 rem。不得输出居中的固定 #canvas；禁止 transform-origin: top center、margin: 0 auto 的 750px/1080px 内层画布。
- 在 ${device.width}px 宽度下应接近设计图；在窄屏预览时应从左上角等比缩放整张设计画布，保持内容不溢出、不重叠，截图不截断。
- 顶层 CSS viewport 必须是 width=device-width，#root 最大宽度应接近 ${device.width}px，页面最小高度应接近 ${device.height}px。

设计系统：
${designSystem && Object.keys(designSystem).length > 0 ? JSON.stringify(designSystem, null, 2) : '无'}

可用本地资源路径：
${availableAssetsText || '无'}

PSD 切图：
${buildPsdSlicesText(file)}

切图标记：
${buildImageReplacementsText(file)}

${existingHtml ? `当前已有 HTML，请在充分比对设计图后更新，不要重新发明无关结构：\n${existingHtml}` : '当前没有已有 HTML，请生成第一版。'}

请直接返回最终 HTML。第一行必须是 <!doctype html>。不要输出解释、Markdown、JSON 或代码块。`;
}

function buildRefinePrompt({ file, sourceImageRelPath, htmlRelPath, device, imageSize, designSystem, currentHtml, instruction, history, availableAssetsText }) {
  const historyText = history.length > 0
    ? history.map((item) => `${item.role === 'assistant' ? 'AI' : '用户'}: ${item.content}`).join('\n')
    : '无';

  return `请根据用户反馈修正当前 UI IR HTML。

页面信息：
- 页面名: ${file?.stateName || file?.name || path.posix.basename(sourceImageRelPath)}
- sourceType: ${file?.sourceType || 'image'}
- 设计图路径: ${sourceImageRelPath}
- HTML 保存路径: ${htmlRelPath}
- 原设计图相对 HTML 路径: ${relativeFromHtml(htmlRelPath, sourceImageRelPath)}
- 设计图实际尺寸: ${imageSize?.width || '未知'}x${imageSize?.height || '未知'}
- HTML 生成基准尺寸: ${device.width}x${device.height}（${device.source === 'image' ? '来自设计图实际像素' : '未解析到图片尺寸时的预览设备兜底'}）
- 页面描述: ${file?.description || '无'}

调整要求：
- 如果当前 HTML 仍是 375px 固定画布、viewport width=375 或整页 absolute 定位，请优先改成以 ${device.width}x${device.height} 为基准的 flex/grid 响应式结构。
- 如果当前 HTML 使用固定 #canvas、transform-origin: top center、margin: 0 auto 或居中缩放导致左侧留白/右侧裁切，必须改成 Lanhu/flexible 风格：设计画布从 (0,0) 开始，外层同步缩放后的宽高，内层 transform-origin: top left。
- 保留当前 HTML 中已识别的业务内容，但修正为完整页面高度和响应式布局。
- 在窄屏预览时允许整体按比例收敛，但内容不能互相覆盖或横向溢出。

设计系统：
${designSystem && Object.keys(designSystem).length > 0 ? JSON.stringify(designSystem, null, 2) : '无'}

可用本地资源路径：
${availableAssetsText || '无'}

PSD 切图：
${buildPsdSlicesText(file)}

切图标记：
${buildImageReplacementsText(file)}

最近对话：
${historyText}

用户本轮反馈：
${instruction}

当前 HTML：
${currentHtml}

请基于当前 HTML 做最小必要修改，并直接返回完整最终 HTML。第一行必须是 <!doctype html>。不要输出解释、Markdown、JSON 或代码块。`;
}

module.exports = {
  buildGeneratePrompt,
  buildRefinePrompt,
  buildSystemPrompt
};
