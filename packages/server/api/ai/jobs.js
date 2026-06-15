const path = require('path');
const fs = require('fs');
const {
  getHtmlDir,
  resolveSafe,
  ensureProjectWritable,
  broadcastProjectEvent
} = require('../utils');
const { buildAvailableLocalAssetsText, repairHtmlLocalAssetReferences } = require('./assets');
const { compactHistory, extractChatText, postChatCompletion, postChatCompletionStream } = require('./chat');
const { getAgentConfig, loadUiIrSpec } = require('./config');
const { requestError } = require('./errors');
const { ensureViewportSafeHtml, findMalformedHtmlSyntax, normalizeHtml } = require('./html');
const { normalizeDevice, readImageFile } = require('./image');
const { normalizeRelPath, pickSourceImageRelPath, targetHtmlRelPath } = require('./paths');
const { buildGeneratePrompt, buildRefinePrompt, buildSystemPrompt } = require('./prompts');
const { emitStage } = require('./progress');

function writeRawAiOutput(rawOutputPath, rawContent) {
  if (!rawOutputPath) return;
  try {
    fs.mkdirSync(path.dirname(rawOutputPath), { recursive: true });
    fs.writeFileSync(rawOutputPath, String(rawContent || ''), 'utf-8');
  } catch (error) {
    console.warn('写入 AI 原始输出失败:', error.message);
  }
}

function readExistingHtml(context, options = {}) {
  const ignoreMalformed = options.ignoreMalformed === true;
  const readValidExisting = (filePath) => {
    const html = fs.readFileSync(filePath, 'utf-8');
    if (ignoreMalformed && findMalformedHtmlSyntax(html)) return '';
    return html;
  };

  if (fs.existsSync(context.htmlAbsPath)) {
    const html = readValidExisting(context.htmlAbsPath);
    if (html || !ignoreMalformed) return html;
  }
  if (context.legacyHtmlAbsPath && fs.existsSync(context.legacyHtmlAbsPath)) {
    return readValidExisting(context.legacyHtmlAbsPath);
  }
  return '';
}

async function callAgent({ prompt, imageDataUrl, rawOutputPath = null, stream = false, onStage = null, onDelta = null }) {
  emitStage(onStage, 'ai-config', '读取 AI 配置');
  const config = getAgentConfig();
  if (!config.apiKey) {
    throw requestError(503, '未配置 AI_AGENT_API_KEY 或 OPENAI_API_KEY');
  }

  emitStage(onStage, 'agent-spec', '读取 UI-IR Agent 规范');
  const uiIrSpec = loadUiIrSpec();
  const systemPrompt = buildSystemPrompt(uiIrSpec);

  emitStage(onStage, 'ai-request', '发送 AI 请求');
  const result = stream
    ? await postChatCompletionStream(config, { systemPrompt, prompt, imageDataUrl }, { onStage, onDelta })
    : { content: extractChatText(await postChatCompletion(config, { systemPrompt, prompt, imageDataUrl })), finishReason: '' };

  emitStage(onStage, 'html-validate', '校验 HTML 输出');
  try {
    return normalizeHtml(result.content);
  } catch (error) {
    writeRawAiOutput(rawOutputPath, result.content);
    if (result.finishReason) {
      error.message = `${error.message}。finish_reason: ${result.finishReason}`;
    }
    if (rawOutputPath) {
      error.message = `${error.message}。原始输出已保存: ${rawOutputPath}`;
    }
    throw error;
  }
}

function loadProjectFileContext(req, projectId, file) {
  const sourceImageRelPath = pickSourceImageRelPath(file);
  if (!sourceImageRelPath) throw requestError(400, '缺少设计图路径');

  const projectDir = getHtmlDir(projectId);
  const sourceAbsPath = resolveSafe(projectDir, sourceImageRelPath);
  if (!sourceAbsPath || !fs.existsSync(sourceAbsPath) || !fs.statSync(sourceAbsPath).isFile()) {
    throw requestError(404, '设计图不存在');
  }

  const htmlRelPath = targetHtmlRelPath(sourceImageRelPath);
  if (!/^__(design|psd)__\//.test(htmlRelPath)) {
    throw requestError(400, 'HTML IR 只能保存到 __design__ 或 __psd__ 目录');
  }
  if (!/\.html?$/i.test(htmlRelPath)) throw requestError(400, 'HTML IR 路径无效');

  const htmlAbsPath = resolveSafe(projectDir, htmlRelPath);
  if (!htmlAbsPath) throw requestError(400, 'HTML IR 路径无效');

  const legacyHtmlRelPath = normalizeRelPath(file?.generatedHtmlPath || '');
  const legacyHtmlAbsPath = legacyHtmlRelPath &&
    legacyHtmlRelPath !== htmlRelPath &&
    /^__(design|psd)__\//.test(legacyHtmlRelPath) &&
    /\.html?$/i.test(legacyHtmlRelPath)
    ? resolveSafe(projectDir, legacyHtmlRelPath)
    : null;

  return {
    projectDir,
    sourceImageRelPath,
    sourceAbsPath,
    htmlRelPath,
    htmlAbsPath,
    legacyHtmlRelPath,
    legacyHtmlAbsPath
  };
}

function writeHtmlIr(req, projectId, context, html) {
  const bundleDir = path.dirname(context.htmlAbsPath);
  fs.mkdirSync(bundleDir, { recursive: true });
  fs.writeFileSync(context.htmlAbsPath, html, 'utf-8');
  const updatedAt = new Date().toISOString();
  broadcastProjectEvent(req, projectId, {
    type: 'html:changed',
    reason: 'html-ir-generated',
    path: context.htmlRelPath,
    sourcePath: context.sourceImageRelPath,
    updatedAt
  });
  return updatedAt;
}

function getRequestProjectId(req) {
  const projectId = Number.parseInt(req.body?.projectId, 10);
  if (!projectId) throw requestError(400, '缺少项目 ID');
  return projectId;
}

function assertProjectWritable(req, projectId) {
  const guard = ensureProjectWritable(req, projectId);
  if (!guard.ok) throw requestError(guard.status || 403, guard.error || '无权修改此项目');
  return guard;
}

function prepareGenerateJob(req, onStage = null) {
  emitStage(onStage, 'prepare', '准备页面上下文');
  const projectId = getRequestProjectId(req);
  emitStage(onStage, 'permission', '检查项目权限');
  assertProjectWritable(req, projectId);

  const file = req.body?.file || {};
  const designSystem = req.body?.designSystem || null;
  emitStage(onStage, 'context', '解析设计图路径');
  const context = loadProjectFileContext(req, projectId, file);
  const existingHtml = readExistingHtml(context, { ignoreMalformed: true });
  if (!existingHtml && (fs.existsSync(context.htmlAbsPath) || (context.legacyHtmlAbsPath && fs.existsSync(context.legacyHtmlAbsPath)))) {
    emitStage(onStage, 'context', '已忽略格式异常的历史 HTML');
  }

  emitStage(onStage, 'image', '读取设计图');
  const imageFile = readImageFile(context.sourceAbsPath);
  const device = normalizeDevice(req.body?.device, imageFile.imageSize);
  if (imageFile.imageSize) {
    emitStage(onStage, 'image-size', `设计图尺寸 ${imageFile.imageSize.width}x${imageFile.imageSize.height}`);
  }

  emitStage(onStage, 'prompt', '组装 UI-IR 提示词');
  const excludeAssetPaths = (Array.isArray(file?.imageReplacements) ? file.imageReplacements : [])
    .map((item) => item?.imagePath)
    .filter(Boolean);
  const availableAssetsText = buildAvailableLocalAssetsText(context, { excludePaths: excludeAssetPaths });
  const prompt = buildGeneratePrompt({
    file,
    sourceImageRelPath: context.sourceImageRelPath,
    htmlRelPath: context.htmlRelPath,
    device,
    imageSize: imageFile.imageSize,
    designSystem,
    existingHtml,
    availableAssetsText
  });

  return {
    projectId,
    file,
    context,
    device,
    imageSize: imageFile.imageSize,
    prompt,
    imageDataUrl: imageFile.dataUrl,
    status: 'generated',
    rounds: Math.max(1, Number.parseInt(file?.htmlIrRounds || 0, 10) + 1)
  };
}

function prepareRefineJob(req, onStage = null) {
  emitStage(onStage, 'prepare', '准备页面上下文');
  const projectId = getRequestProjectId(req);
  emitStage(onStage, 'permission', '检查项目权限');
  assertProjectWritable(req, projectId);

  const instruction = String(req.body?.instruction || '').trim();
  if (!instruction) throw requestError(400, '请输入调整说明');

  const file = req.body?.file || {};
  const designSystem = req.body?.designSystem || null;
  const history = compactHistory(req.body?.history);
  emitStage(onStage, 'context', '解析设计图和当前 HTML');
  const context = loadProjectFileContext(req, projectId, file);
  const currentHtml = readExistingHtml(context);
  if (!currentHtml) {
    throw requestError(404, '请先生成 HTML IR');
  }
  const malformedCurrent = findMalformedHtmlSyntax(currentHtml);
  if (malformedCurrent) {
    throw requestError(422, `当前 HTML IR 格式异常，请先重新生成。异常片段: ${malformedCurrent}`);
  }

  emitStage(onStage, 'image', '读取设计图');
  const imageFile = readImageFile(context.sourceAbsPath);
  const device = normalizeDevice(req.body?.device, imageFile.imageSize);
  if (imageFile.imageSize) {
    emitStage(onStage, 'image-size', `设计图尺寸 ${imageFile.imageSize.width}x${imageFile.imageSize.height}`);
  }

  emitStage(onStage, 'prompt', '组装调整提示词');
  const excludeAssetPaths = (Array.isArray(file?.imageReplacements) ? file.imageReplacements : [])
    .map((item) => item?.imagePath)
    .filter(Boolean);
  const availableAssetsText = buildAvailableLocalAssetsText(context, { excludePaths: excludeAssetPaths });
  const prompt = buildRefinePrompt({
    file,
    sourceImageRelPath: context.sourceImageRelPath,
    htmlRelPath: context.htmlRelPath,
    device,
    imageSize: imageFile.imageSize,
    designSystem,
    currentHtml,
    instruction,
    history,
    availableAssetsText
  });

  return {
    projectId,
    file,
    context,
    device,
    imageSize: imageFile.imageSize,
    prompt,
    imageDataUrl: imageFile.dataUrl,
    status: 'refined',
    rounds: Math.max(1, Number.parseInt(file?.htmlIrRounds || 0, 10) + 1)
  };
}

async function runAgentJob(req, job, { stream = false, onStage = null, onDelta = null } = {}) {
  const html = await callAgent({
    prompt: job.prompt,
    imageDataUrl: job.imageDataUrl,
    rawOutputPath: path.join(path.dirname(job.context.htmlAbsPath), '__ai_raw_response.txt'),
    stream,
    onStage,
    onDelta
  });

  emitStage(onStage, 'asset-validate', '校验本地资源引用');
  const repaired = repairHtmlLocalAssetReferences(html, job.context);
  if (repaired.replacements.length > 0) {
    emitStage(onStage, 'asset-repair', `已修复 ${repaired.replacements.length} 个本地资源路径`);
  }

  emitStage(onStage, 'viewport-guard', '校验预览缩放结构');
  const viewportSafeHtml = ensureViewportSafeHtml(repaired.html, job.imageSize || job.device);

  emitStage(onStage, 'saving', '写入 HTML IR 文件');
  const updatedAt = writeHtmlIr(req, job.projectId, job.context, viewportSafeHtml);
  emitStage(onStage, 'done', 'HTML IR 已生成');

  return {
    html: viewportSafeHtml,
    htmlPath: job.context.htmlRelPath,
    sourcePath: job.context.sourceImageRelPath,
    status: job.status,
    rounds: job.rounds,
    updatedAt
  };
}

module.exports = {
  prepareGenerateJob,
  prepareRefineJob,
  runAgentJob
};
