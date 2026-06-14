/**
 * AI HTML IR Agent
 *
 * MVP: PNG/PSD preview image -> HTML IR, then conversational HTML refinements.
 * Uses the OpenAI Chat Completions API without adding a heavy agent framework
 * dependency.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');
const router = express.Router();
const {
  getHtmlDir,
  resolveSafe,
  asyncHandler,
  ensureProjectWritable,
  broadcastProjectEvent
} = require('./utils');

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o';
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_HISTORY_ITEMS = 12;
const SERVER_ENV_PATH = path.resolve(__dirname, '..', '.env');

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};
const LOCAL_IMAGE_EXT_RE = /\.(?:png|jpe?g|webp|gif)$/i;
const LOCAL_ASSET_ROOTS = ['__assets__', '__design__', '__psd__'];
const MAX_PROMPT_ASSETS = 80;

function requestError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

let cachedServerEnv = null;

function unquoteEnvValue(value) {
  const trimmed = String(value || '').trim();
  if (trimmed.length >= 2) {
    const quote = trimmed[0];
    if ((quote === '"' || quote === "'") && trimmed[trimmed.length - 1] === quote) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function loadServerEnv() {
  if (cachedServerEnv) return cachedServerEnv;
  const env = {};
  if (!fs.existsSync(SERVER_ENV_PATH)) {
    cachedServerEnv = env;
    return env;
  }

  const content = fs.readFileSync(SERVER_ENV_PATH, 'utf-8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const index = normalized.indexOf('=');
    if (index <= 0) continue;
    const key = normalized.slice(0, index).trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) continue;
    env[key] = unquoteEnvValue(normalized.slice(index + 1));
  }
  cachedServerEnv = env;
  return env;
}

function getEnvValue(key) {
  const value = process.env[key];
  if (value != null && value !== '') return value;
  return loadServerEnv()[key] || '';
}

function getAgentConfig() {
  const baseURL = getEnvValue('AI_AGENT_BASE_URL') || getEnvValue('OPENAI_BASE_URL') || DEFAULT_BASE_URL;
  const apiKey = getEnvValue('AI_AGENT_API_KEY') || getEnvValue('OPENAI_API_KEY') || '';
  const model = getEnvValue('AI_AGENT_MODEL') || getEnvValue('OPENAI_MODEL') || DEFAULT_MODEL;
  const maxTokens = Number.parseInt(getEnvValue('AI_AGENT_MAX_TOKENS') || '12000', 10);
  return {
    baseURL: baseURL.replace(/\/+$/, ''),
    apiKey,
    model,
    maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 12000
  };
}

function normalizeRelPath(value) {
  return String(value || '').replace(/^[/\\]+/, '').replace(/\\/g, '/');
}

function pickSourceImageRelPath(file) {
  if (!file || typeof file !== 'object') return '';
  if (file.sourceType === 'psd') {
    return normalizeRelPath(file.previewPath || file.imagePath || String(file.path || '').replace(/\.psd$/i, '.png'));
  }
  return normalizeRelPath(file.imagePath || file.previewPath || file.path);
}

function targetHtmlRelPath(sourceImageRelPath) {
  const rel = normalizeRelPath(sourceImageRelPath);
  const parsed = path.posix.parse(rel);
  return path.posix.join(parsed.dir, parsed.name, 'index.html');
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_BY_EXT[ext] || null;
}

function parsePngDimensions(buffer) {
  if (buffer.length < 24) return null;
  const signature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== signature) return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function parseJpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

  while (offset + 3 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) break;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (offset + 2 > buffer.length) break;

    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;

    if (sofMarkers.has(marker) && offset + 7 <= buffer.length) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5)
      };
    }

    offset += length;
  }

  return null;
}

function readUInt24LE(buffer, offset) {
  if (offset + 3 > buffer.length) return 0;
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function parseWebpDimensions(buffer) {
  if (buffer.length < 30) return null;
  if (buffer.subarray(0, 4).toString('ascii') !== 'RIFF') return null;
  if (buffer.subarray(8, 12).toString('ascii') !== 'WEBP') return null;

  const chunk = buffer.subarray(12, 16).toString('ascii');
  if (chunk === 'VP8X' && buffer.length >= 30) {
    return {
      width: readUInt24LE(buffer, 24) + 1,
      height: readUInt24LE(buffer, 27) + 1
    };
  }

  if (chunk === 'VP8L' && buffer.length >= 25 && buffer[20] === 0x2f) {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1
    };
  }

  if (chunk === 'VP8 ' && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff
    };
  }

  return null;
}

function parseImageDimensions(buffer, mime) {
  let dimensions = null;
  if (mime === 'image/png') dimensions = parsePngDimensions(buffer);
  if (mime === 'image/jpeg') dimensions = parseJpegDimensions(buffer);
  if (mime === 'image/webp') dimensions = parseWebpDimensions(buffer);

  const width = Number.parseInt(dimensions?.width, 10);
  const height = Number.parseInt(dimensions?.height, 10);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return null;
  return { width, height };
}

function loadUiIrSpec() {
  const specPath = path.resolve(__dirname, '../../..', 'UI-IR-AGENT.md');
  if (!fs.existsSync(specPath)) {
    throw requestError(500, '缺少 UI-IR-AGENT.md');
  }
  return fs.readFileSync(specPath, 'utf-8');
}

function readImageFile(absPath) {
  const mime = getMimeType(absPath);
  if (!mime) throw requestError(400, '设计图格式仅支持 PNG/JPG/WebP');
  const stat = fs.statSync(absPath);
  if (stat.size > MAX_IMAGE_BYTES) throw requestError(413, '设计图超过 20MB');
  const buffer = fs.readFileSync(absPath);
  return {
    dataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
    imageSize: parseImageDimensions(buffer, mime),
    mime,
    bytes: stat.size
  };
}

function normalizeDevice(device, imageSize = null) {
  const imageWidth = Number.parseInt(imageSize?.width, 10);
  const imageHeight = Number.parseInt(imageSize?.height, 10);
  if (Number.isFinite(imageWidth) && imageWidth > 0 && Number.isFinite(imageHeight) && imageHeight > 0) {
    return {
      width: imageWidth,
      height: imageHeight,
      source: 'image'
    };
  }

  const width = Number.parseInt(device?.width, 10);
  const height = Number.parseInt(device?.height, 10);
  return {
    width: Number.isFinite(width) && width > 0 ? width : 375,
    height: Number.isFinite(height) && height > 0 ? height : 812,
    source: 'device'
  };
}

function compactHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-MAX_HISTORY_ITEMS)
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: String(item?.content || '').slice(0, 4000)
    }))
    .filter((item) => item.content.trim());
}

function extractTextContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item?.type === 'text') return item.text || '';
      if (typeof item?.text === 'string') return item.text;
      if (typeof item?.content === 'string') return item.content;
      if (typeof item?.value === 'string') return item.value;
      return '';
    })
    .join('\n');
}

function firstTextValue(candidates, options = {}) {
  const preserveWhitespace = options.preserveWhitespace === true;
  for (const candidate of candidates) {
    const text = extractTextContent(candidate);
    if (preserveWhitespace) {
      if (text.length > 0) return text;
    } else if (text.trim()) {
      return text.trim();
    }
  }
  return '';
}

function extractChatText(data) {
  const choice = data?.choices?.[0] || {};
  return firstTextValue([
    choice.message?.content,
    choice.text,
    data?.output_text,
    data?.text,
    data?.content,
    data?.message?.content
  ]);
}

function extractChatDeltaText(chunk) {
  const choice = chunk?.choices?.[0] || {};
  return firstTextValue([
    choice.delta?.content,
    choice.delta?.text,
    choice.message?.content,
    chunk?.output_text,
    chunk?.text,
    chunk?.content
  ], { preserveWhitespace: true });
}

function emitStage(onStage, stage, message, detail = null) {
  if (typeof onStage !== 'function') return;
  onStage(stage, message, detail);
}

function wantsEventStream(req) {
  const accept = String(req.get?.('accept') || '').toLowerCase();
  return req.body?.stream === true || accept.includes('text/event-stream');
}

function createSseWriter(req, res) {
  let closed = false;
  const headers = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  };

  if (typeof res.status === 'function') res.status(200);
  if (typeof res.set === 'function') {
    res.set(headers);
  } else if (typeof res.writeHead === 'function') {
    res.writeHead(200, headers);
  }
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const heartbeat = setInterval(() => {
    if (!closed && !res.destroyed && typeof res.write === 'function') {
      res.write(': keep-alive\n\n');
    }
  }, 15000);

  const close = () => {
    closed = true;
    clearInterval(heartbeat);
  };
  req.on?.('aborted', close);
  res.on?.('close', close);

  function write(event, payload) {
    if (closed || res.destroyed || typeof res.write !== 'function') return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload || {})}\n\n`);
  }

  return {
    stage(stage, message, detail = null) {
      write('stage', {
        stage,
        message,
        detail,
        at: new Date().toISOString()
      });
    },
    delta(text, chars) {
      write('delta', { text, chars });
    },
    done(payload) {
      write('done', payload);
    },
    error(error) {
      const status = error?.status || 500;
      write('error', {
        status,
        error: error?.message || String(error || 'AI HTML Agent 执行失败')
      });
    },
    end() {
      closed = true;
      clearInterval(heartbeat);
      if (!res.destroyed && typeof res.end === 'function') res.end();
    }
  };
}

function normalizeHtml(raw) {
  let html = extractTextContent(raw).trim();
  if (html.startsWith('{')) {
    try {
      const parsed = JSON.parse(html);
      html = String(parsed.html || parsed.content || parsed.output || html).trim();
    } catch { }
  }
  const fenced = html.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) html = fenced[1].trim();
  html = html.replace(/^```(?:html)?\s*/i, '').replace(/```$/i, '').trim();
  html = extractHtmlDocument(html);

  if (!/<html[\s>]/i.test(html)) {
    const firstTagIndex = html.search(/<(?:body|main|section|div|style|header|nav|footer|article|ul|ol|form|img|svg)[\s>]/i);
    if (firstTagIndex >= 0) {
      const fragment = html.slice(firstTagIndex).trim();
      html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>UI IR</title>
  </head>
  <body>
${fragment}
  </body>
</html>`;
    }
  }

  if (!/<html[\s>]/i.test(html)) {
    const snippet = html.slice(0, 500).replace(/\s+/g, ' ').trim();
    throw requestError(502, `AI 未返回有效 HTML。返回片段: ${snippet || '(empty)'}`);
  }
  const forbiddenSvg = findForbiddenSvgSyntax(html);
  if (forbiddenSvg) {
    throw requestError(502, `AI 返回的 HTML 包含禁用的 SVG。请使用已有切图；没有切图覆盖的区域用普通 div/img 占位图块。异常片段: ${forbiddenSvg}`);
  }
  html = sanitizeDisallowedInteractionCss(html);
  const malformed = findMalformedHtmlSyntax(html);
  if (malformed) {
    throw requestError(502, `AI 返回的 HTML 格式异常，疑似流式空格丢失或标签属性缺少空格。异常片段: ${malformed}`);
  }
  return html;
}

function stripAfterClosingHtml(html) {
  const closingMatches = Array.from(html.matchAll(/<\/html\s*>/ig));
  if (closingMatches.length === 0) return html.trim();
  const last = closingMatches[closingMatches.length - 1];
  return html.slice(0, last.index + last[0].length).trim();
}

function extractHtmlDocument(rawHtml) {
  const source = String(rawHtml || '').trim();
  if (!source) return '';

  const doctypePattern = /<!doctype\s+html[^>]*>/ig;
  for (const match of Array.from(source.matchAll(doctypePattern)).reverse()) {
    const candidate = source.slice(match.index).trim();
    const afterDoctype = candidate.slice(match[0].length);
    if (/^(?:\s|<!--[\s\S]*?-->)*<html[\s>]/i.test(afterDoctype)) {
      return stripAfterClosingHtml(candidate);
    }
  }

  const htmlIndex = source.search(/<html[\s>]/i);
  if (htmlIndex >= 0) return stripAfterClosingHtml(source.slice(htmlIndex));
  return source;
}

function findForbiddenSvgSyntax(html) {
  const pattern = /<\/?(?:svg|path|circle|ellipse|rect|line|polyline|polygon|defs|clipPath|linearGradient|radialGradient|stop|g|use|symbol|mask)\b/i;
  const match = String(html || '').match(pattern);
  if (!match) return '';
  const index = Math.max(0, match.index - 80);
  return String(html || '').slice(index, match.index + 180).replace(/\s+/g, ' ').trim();
}

function sanitizeDisallowedInteractionCss(html) {
  const declaration = '(?:pointer-events\\s*:\\s*none|(?:-webkit-|-moz-|-ms-)?user-select\\s*:\\s*none)\\s*(?:!important)?\\s*;?';
  const linePattern = new RegExp(`^[ \\t]*${declaration}[ \\t]*(?:\\r?\\n)?`, 'gim');
  const inlinePattern = new RegExp(`[ \\t]*${declaration}`, 'gi');
  return String(html || '')
    .replace(linePattern, '')
    .replace(inlinePattern, '');
}

function findMalformedHtmlSyntax(html) {
  const attrNames = [
    'id', 'class', 'src', 'alt', 'href', 'style', 'type', 'role', 'name', 'value',
    'data-', 'aria-', 'viewBox', 'xmlns', 'width', 'height', 'cx', 'cy', 'r',
    'rx', 'ry', 'x', 'y', 'd', 'fill', 'stroke', 'stroke-width', 'clip-path'
  ];
  const tagNames = [
    'a', 'article', 'body', 'button', 'circle', 'clipPath', 'defs', 'div',
    'ellipse', 'footer', 'form', 'g', 'h1', 'h2', 'h3', 'header', 'html', 'img',
    'input', 'li', 'main', 'nav', 'path', 'rect', 'script', 'section', 'span',
    'style', 'svg', 'ul'
  ];
  const pattern = new RegExp(`<(?:${tagNames.join('|')})(?:${attrNames.join('|')})=`, 'i');
  const match = html.match(pattern);
  if (!match) return '';
  const index = Math.max(0, match.index - 80);
  return html.slice(index, match.index + 180).replace(/\s+/g, ' ').trim();
}

function buildChatCompletionPayload(config, { systemPrompt, prompt, imageDataUrl }, stream = false) {
  const payload = {
    model: config.model,
    max_tokens: config.maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } }
        ]
      }
    ]
  };
  if (stream) payload.stream = true;
  return payload;
}

function sdkRequestError(sdkError) {
  const status = sdkError?.status || sdkError?.response?.status || 500;
  const detail = sdkError?.error
    ? JSON.stringify({ error: sdkError.error })
    : (sdkError?.message || String(sdkError));
  const error = requestError(status >= 500 ? 502 : status, `AI 调用失败: ${detail}`);
  error.responseStatus = status;
  error.responseText = detail;
  return error;
}

async function postChatCompletion(config, { systemPrompt, prompt, imageDataUrl }) {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL
  });

  try {
    return await client.chat.completions.create(
      buildChatCompletionPayload(config, { systemPrompt, prompt, imageDataUrl }, false)
    );
  } catch (sdkError) {
    throw sdkRequestError(sdkError);
  }
}

async function postChatCompletionStream(config, { systemPrompt, prompt, imageDataUrl }, { onStage, onDelta } = {}) {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL
  });

  let content = '';
  let finishReason = '';
  let sawFirstContent = false;

  try {
    const stream = await client.chat.completions.create(
      buildChatCompletionPayload(config, { systemPrompt, prompt, imageDataUrl }, true)
    );

    for await (const chunk of stream) {
      const choice = chunk?.choices?.[0] || {};
      if (choice.finish_reason) finishReason = choice.finish_reason;

      const delta = extractChatDeltaText(chunk);
      if (!delta) continue;

      if (!sawFirstContent) {
        sawFirstContent = true;
        emitStage(onStage, 'ai-stream', 'AI 正在返回 HTML');
      }
      content += delta;
      if (typeof onDelta === 'function') onDelta(delta, content.length);
    }
  } catch (sdkError) {
    throw sdkRequestError(sdkError);
  }

  return { content, finishReason };
}

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

function relativeFromHtml(htmlRelPath, targetRelPath) {
  const rel = path.posix.relative(path.posix.dirname(htmlRelPath), normalizeRelPath(targetRelPath));
  if (!rel || rel.startsWith('.')) return rel || '.';
  return `./${rel}`;
}

function extractHashTokens(value) {
  return Array.from(new Set(String(value || '').match(/[a-f0-9]{10}/ig) || []))
    .map((item) => item.toLowerCase());
}

function assetMatchKey(fileName) {
  const basename = path.posix.basename(String(fileName || '')).toLowerCase();
  const match = basename.match(/[a-f0-9]{10}_.+$/i);
  return match ? match[0].toLowerCase() : basename;
}

function walkLocalImageAssets(projectDir, relDir, output) {
  const absDir = resolveSafe(projectDir, relDir);
  if (!absDir || !fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) return;

  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const relPath = path.posix.join(relDir, entry.name);
    const absPath = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      walkLocalImageAssets(projectDir, relPath, output);
    } else if (entry.isFile() && LOCAL_IMAGE_EXT_RE.test(entry.name)) {
      output.push({
        relPath,
        basename: path.posix.basename(relPath),
        ext: path.posix.extname(relPath).toLowerCase()
      });
    }
  }
}

function listProjectLocalImageAssets(projectDir) {
  const assets = [];
  for (const root of LOCAL_ASSET_ROOTS) {
    walkLocalImageAssets(projectDir, root, assets);
  }
  return assets.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

function buildAssetIndex(context) {
  const assets = listProjectLocalImageAssets(context.projectDir);
  const byBasename = new Map();
  const byKey = new Map();

  for (const asset of assets) {
    const basename = asset.basename.toLowerCase();
    const key = assetMatchKey(asset.basename);
    if (!byBasename.has(basename)) byBasename.set(basename, []);
    if (!byKey.has(key)) byKey.set(key, []);
    byBasename.get(basename).push(asset);
    byKey.get(key).push(asset);
  }

  return {
    assets,
    byBasename,
    byKey,
    sourceHashes: extractHashTokens(context.sourceImageRelPath)
  };
}

function rankAssetCandidate(asset, sourceHashes) {
  let score = asset.relPath.length / 1000;
  if (asset.relPath.startsWith('__assets__/')) score -= 100;
  if (sourceHashes.some((hash) => asset.basename.toLowerCase().includes(hash))) score -= 10;
  return score;
}

function pickAssetCandidate(candidates, sourceHashes, preferredExt) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const extMatches = candidates.filter((asset) => !preferredExt || asset.ext === preferredExt);
  const scoped = extMatches.length > 0 ? extMatches : candidates;
  return scoped
    .slice()
    .sort((a, b) => rankAssetCandidate(a, sourceHashes) - rankAssetCandidate(b, sourceHashes))
  [0] || null;
}

function splitLocalResourceUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('#')) return null;
  if (/^(?:data|blob|https?|mailto|tel|javascript):/i.test(raw)) return null;

  const suffixIndex = [raw.indexOf('?'), raw.indexOf('#')]
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const pathname = suffixIndex >= 0 ? raw.slice(0, suffixIndex) : raw;
  const suffix = suffixIndex >= 0 ? raw.slice(suffixIndex) : '';
  if (!LOCAL_IMAGE_EXT_RE.test(pathname)) return null;

  let decodedPathname = pathname;
  try {
    decodedPathname = decodeURI(pathname);
  } catch { }

  return { raw, pathname: decodedPathname.replace(/\\/g, '/'), suffix };
}

function localResourceToProjectRel(context, pathname) {
  let clean = String(pathname || '').replace(/\\/g, '/').trim();
  const servedProjectMatch = clean.match(/^\/?html\/\d+\/(.+)$/i);
  if (servedProjectMatch) clean = servedProjectMatch[1];
  if (clean.startsWith('/')) clean = clean.slice(1);

  const relPath = clean.startsWith('__')
    ? normalizeRelPath(clean)
    : normalizeRelPath(path.posix.normalize(path.posix.join(path.posix.dirname(context.htmlRelPath), clean)));
  const absPath = resolveSafe(context.projectDir, relPath);
  return absPath ? { relPath, absPath } : null;
}

function findExistingAssetForMissingReference(context, pathname, assetIndex) {
  const basename = path.posix.basename(String(pathname || '')).toLowerCase();
  const preferredExt = path.posix.extname(basename).toLowerCase();
  const exact = pickAssetCandidate(assetIndex.byBasename.get(basename), assetIndex.sourceHashes, preferredExt);
  if (exact) return exact;

  const key = assetMatchKey(basename);
  return pickAssetCandidate(assetIndex.byKey.get(key), assetIndex.sourceHashes, preferredExt);
}

function extractHtmlLocalResourceRefs(html) {
  const refs = new Set();
  String(html || '').replace(/\b(?:src|href|poster)\s*=\s*(["'])([^"']+)\1/gi, (_match, _quote, value) => {
    refs.add(value);
    return _match;
  });
  String(html || '').replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (_match, _quote, value) => {
    refs.add(value);
    return _match;
  });
  return Array.from(refs);
}

function repairHtmlLocalAssetReferences(html, context) {
  const assetIndex = buildAssetIndex(context);
  const replacements = [];
  const missing = [];

  for (const rawRef of extractHtmlLocalResourceRefs(html)) {
    const resource = splitLocalResourceUrl(rawRef);
    if (!resource) continue;

    const resolved = localResourceToProjectRel(context, resource.pathname);
    if (resolved?.absPath && fs.existsSync(resolved.absPath) && fs.statSync(resolved.absPath).isFile()) {
      continue;
    }

    const asset = findExistingAssetForMissingReference(context, resource.pathname, assetIndex);
    if (asset) {
      const replacement = `${relativeFromHtml(context.htmlRelPath, asset.relPath)}${resource.suffix}`;
      if (replacement !== rawRef) {
        replacements.push({ from: rawRef, to: replacement, assetPath: asset.relPath });
      }
    } else {
      missing.push(rawRef);
    }
  }

  if (missing.length > 0) {
    const snippet = missing.slice(0, 5).join(', ');
    throw requestError(502, `AI 引用了不存在的本地图片资源: ${snippet}`);
  }

  let repairedHtml = String(html || '');
  const uniqueReplacements = Array.from(new Map(replacements.map((item) => [item.from, item])).values());
  uniqueReplacements
    .sort((a, b) => b.from.length - a.from.length)
    .forEach((item) => {
      repairedHtml = repairedHtml.split(item.from).join(item.to);
    });

  return { html: repairedHtml, replacements: uniqueReplacements };
}

function buildAvailableLocalAssetsText(context) {
  const sourceHashes = extractHashTokens(context.sourceImageRelPath);
  const assets = listProjectLocalImageAssets(context.projectDir);
  const sameSourceAssets = sourceHashes.length > 0
    ? assets.filter((asset) => sourceHashes.some((hash) => asset.basename.toLowerCase().includes(hash)))
    : [];
  const scopedAssets = (sameSourceAssets.length > 0 ? sameSourceAssets : assets).slice(0, MAX_PROMPT_ASSETS);
  if (scopedAssets.length === 0) return '无';
  return scopedAssets
    .map((asset) => `- ${relativeFromHtml(context.htmlRelPath, asset.relPath)}`)
    .join('\n');
}

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
- 主页面结构必须使用 flex 或 grid：按 header/profile/stats/orders/banner/tools/footer 等区块组织；禁止用整页 absolute left/top 定位复刻所有内容。组件内部的徽标、装饰、图标叠层可以少量 absolute。
- 根容器应使用 width: min(100%, 设计图宽度px)、max-width: 设计图宽度px、margin: 0 auto，并通过百分比、clamp、calc、flex-wrap 或网格列实现响应式适配，避免横向滚动。
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
- 在 ${device.width}px 宽度下应接近设计图；在窄屏预览时应等比压缩间距和字号，保持内容不溢出、不重叠。
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
  // FIXME: 暂时不需要
  // for (const childDir of ['img', 'css', 'js']) {
  //   fs.mkdirSync(path.join(bundleDir, childDir), { recursive: true });
  // }
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
  const availableAssetsText = buildAvailableLocalAssetsText(context);
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
  const availableAssetsText = buildAvailableLocalAssetsText(context);
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

  emitStage(onStage, 'saving', '写入 HTML IR 文件');
  const updatedAt = writeHtmlIr(req, job.projectId, job.context, repaired.html);
  emitStage(onStage, 'done', 'HTML IR 已生成');

  return {
    html: repaired.html,
    htmlPath: job.context.htmlRelPath,
    sourcePath: job.context.sourceImageRelPath,
    status: job.status,
    rounds: job.rounds,
    updatedAt
  };
}

async function streamAgentJob(req, res, prepareJob) {
  const sse = createSseWriter(req, res);
  try {
    const job = prepareJob(req, sse.stage);
    const payload = await runAgentJob(req, job, {
      stream: true,
      onStage: sse.stage,
      onDelta: sse.delta
    });
    sse.done(payload);
  } catch (error) {
    sse.error(error);
  } finally {
    sse.end();
  }
}

router.post('/ai-html-agent/generate', asyncHandler(async (req, res) => {
  if (wantsEventStream(req)) {
    await streamAgentJob(req, res, prepareGenerateJob);
    return;
  }

  const job = prepareGenerateJob(req);
  const payload = await runAgentJob(req, job);
  res.json(payload);
}));

router.post('/ai-html-agent/refine', asyncHandler(async (req, res) => {
  if (wantsEventStream(req)) {
    await streamAgentJob(req, res, prepareRefineJob);
    return;
  }

  const job = prepareRefineJob(req);
  const payload = await runAgentJob(req, job);
  res.json(payload);
}));

router.__test = {
  extractChatDeltaText,
  extractHtmlDocument,
  findForbiddenSvgSyntax,
  findMalformedHtmlSyntax,
  normalizeHtml,
  repairHtmlLocalAssetReferences,
  buildAvailableLocalAssetsText
};

module.exports = router;
