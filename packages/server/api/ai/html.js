const { extractTextContent } = require('./content');
const { requestError } = require('./errors');

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

function parseDimensionPair(value) {
  const match = String(value || '').match(/(\d{2,5})\s*x\s*(\d{2,5})/i);
  if (!match) return null;
  const width = Number.parseInt(match[1], 10);
  const height = Number.parseInt(match[2], 10);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return null;
  return { width, height };
}

function parseCssPixelValue(html, name) {
  const escapedName = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escapedName}\\s*:\\s*(\\d{2,5})(?:px)?\\s*;`, 'i');
  const match = String(html || '').match(pattern);
  if (!match) return 0;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function inferHtmlDesignSize(html, fallbackSize = {}) {
  const fallbackWidth = Number.parseInt(fallbackSize?.width, 10);
  const fallbackHeight = Number.parseInt(fallbackSize?.height, 10);
  const rootDevice = String(html || '').match(/\bdata-device\s*=\s*(["'])([^"']+)\1/i);
  const parsedDevice = parseDimensionPair(rootDevice?.[2]);
  const pageW = parseCssPixelValue(html, '--page-w') || parseCssPixelValue(html, '--aps-page-w');
  const pageH = parseCssPixelValue(html, '--page-h') || parseCssPixelValue(html, '--aps-page-h');
  const pageWidth = String(html || '').match(/\.page\s*\{[\s\S]*?\bwidth\s*:\s*(\d{2,5})px/i);
  const pageHeight = String(html || '').match(/\.page\s*\{[\s\S]*?\bheight\s*:\s*(\d{2,5})px/i);
  const canvasWidth = String(html || '').match(/#canvas\s*\{[\s\S]*?\bwidth\s*:\s*(\d{2,5})px/i);
  const canvasHeight = String(html || '').match(/#canvas\s*\{[\s\S]*?\bheight\s*:\s*(\d{2,5})px/i);
  const width = pageW || Number.parseInt(pageWidth?.[1], 10) || Number.parseInt(canvasWidth?.[1], 10) || parsedDevice?.width || fallbackWidth;
  const height = pageH || Number.parseInt(pageHeight?.[1], 10) || Number.parseInt(canvasHeight?.[1], 10) || parsedDevice?.height || fallbackHeight;

  return {
    width: Number.isFinite(width) && width > 0 ? width : 375,
    height: Number.isFinite(height) && height > 0 ? height : 812
  };
}

function hasFixedCanvasScaleLayout(html) {
  const source = String(html || '');
  return /\bid\s*=\s*(["'])canvas\1/i.test(source) &&
    /#canvas\s*\{[\s\S]*?\btransform\s*:\s*scale\s*\(/i.test(source);
}

function hasFixedPagePixelLayout(html) {
  const source = String(html || '');
  const pageRule = source.match(/\.page\s*\{[\s\S]*?\}/i)?.[0] || '';
  if (!pageRule || /\btransform\s*:\s*scale\s*\(/i.test(pageRule)) return false;
  const width = Number.parseInt(pageRule.match(/\bwidth\s*:\s*(\d{2,5})px/i)?.[1], 10);
  const height = Number.parseInt(pageRule.match(/\bheight\s*:\s*(\d{2,5})px/i)?.[1], 10);
  return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
}

function insertBeforeClosingTag(html, tagName, content) {
  const pattern = new RegExp(`</${tagName}\\s*>`, 'i');
  if (pattern.test(html)) return html.replace(pattern, `${content}\n</${tagName}>`);
  return `${html}\n${content}`;
}

function stripViewportGuard(html) {
  return String(html || '')
    .replace(/\n?\s*<style\b[^>]*\bid=(["'])aps-html-ir-viewport-guard\1[^>]*>[\s\S]*?<\/style>/ig, '')
    .replace(/\n?\s*<script\b[^>]*\bid=(["'])aps-html-ir-viewport-guard-script\1[^>]*>[\s\S]*?<\/script>/ig, '');
}

function buildViewportGuardStyle(width, height) {
  return `<style id="aps-html-ir-viewport-guard">
      :root {
        --aps-page-w: ${width}px;
        --aps-page-h: ${height}px;
        --aps-scale: 1;
        --aps-scaled-page-w: ${width}px;
        --aps-scaled-page-h: ${height}px;
      }

      html,
      body {
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        height: auto !important;
        min-height: var(--aps-scaled-page-h) !important;
        overflow-x: hidden !important;
        overflow-y: auto !important;
        background: #ffffff;
      }

      body {
        transform: none !important;
      }

      #root {
        position: relative !important;
        width: var(--aps-scaled-page-w) !important;
        max-width: none !important;
        min-width: 0 !important;
        height: var(--aps-scaled-page-h) !important;
        min-height: var(--aps-scaled-page-h) !important;
        margin: 0 !important;
        overflow: hidden !important;
        transform: none !important;
      }

      #root > #canvas,
      #canvas {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        right: auto !important;
        bottom: auto !important;
        width: var(--aps-page-w) !important;
        height: var(--aps-page-h) !important;
        max-width: none !important;
        margin: 0 !important;
        transform: scale(var(--aps-scale)) !important;
        transform-origin: top left !important;
      }

      #root > .stage {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        right: auto !important;
        bottom: auto !important;
        width: var(--aps-page-w) !important;
        height: var(--aps-page-h) !important;
        max-width: none !important;
        margin: 0 !important;
        overflow: hidden !important;
        transform: scale(var(--aps-scale)) !important;
        transform-origin: top left !important;
      }

      #root > .stage > .page {
        width: var(--aps-page-w) !important;
        height: var(--aps-page-h) !important;
        margin: 0 !important;
        transform: none !important;
      }

      #root > .page,
      body > .page {
        position: relative !important;
        width: var(--aps-page-w) !important;
        height: var(--aps-page-h) !important;
        max-width: none !important;
        margin: 0 !important;
        overflow: hidden !important;
        transform: scale(var(--aps-scale)) !important;
        transform-origin: top left !important;
      }
    </style>`;
}

function buildViewportGuardScript(width, height) {
  return `<script id="aps-html-ir-viewport-guard-script">
      (function () {
        var designWidth = ${width};
        var designHeight = ${height};

        function viewportWidth() {
          return Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
        }

        function updateApsScale() {
          var scale = Math.min(1, Math.max(0.01, viewportWidth() / designWidth));
          var style = document.documentElement.style;
          style.setProperty('--aps-page-w', designWidth + 'px');
          style.setProperty('--aps-page-h', designHeight + 'px');
          style.setProperty('--aps-scale', String(scale));
          style.setProperty('--scale', String(scale));
          style.setProperty('--aps-scaled-page-w', (designWidth * scale) + 'px');
          style.setProperty('--aps-scaled-page-h', (designHeight * scale) + 'px');
        }

        window.addEventListener('pageshow', updateApsScale);
        window.addEventListener('resize', updateApsScale, { passive: true });
        updateApsScale();
      })();
    </script>`;
}

function ensureViewportSafeHtml(html, fallbackSize = {}) {
  let output = String(html || '');
  if (
    !hasFixedCanvasScaleLayout(output) &&
    !hasFixedPagePixelLayout(output)
  ) {
    return output;
  }

  const { width, height } = inferHtmlDesignSize(output, fallbackSize);
  output = stripViewportGuard(output);
  output = insertBeforeClosingTag(output, 'head', buildViewportGuardStyle(width, height));
  output = insertBeforeClosingTag(output, 'body', buildViewportGuardScript(width, height));
  return output;
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

module.exports = {
  ensureViewportSafeHtml,
  extractHtmlDocument,
  findForbiddenSvgSyntax,
  findMalformedHtmlSyntax,
  hasFixedCanvasScaleLayout,
  hasFixedPagePixelLayout,
  inferHtmlDesignSize,
  normalizeHtml,
  stripViewportGuard
};
