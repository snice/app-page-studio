const assert = require('assert');
const router = require('../api/ai-html-agent');

const {
  ensureViewportSafeHtml,
  hasFixedCanvasScaleLayout,
  hasFixedPagePixelLayout,
  inferHtmlDesignSize,
  stripViewportGuard
} = router.__test;

const fixedCanvasHtml = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root { --scale: 1; --page-w: 750px; --page-h: 2758px; }
      #root { width: 100%; max-width: 750px; margin: 0 auto; }
      #canvas {
        width: 750px;
        height: 2758px;
        margin: 0 auto;
        transform: scale(var(--scale));
        transform-origin: top center;
      }
    </style>
  </head>
  <body>
    <div id="root" data-device="750x2758"><div id="canvas"></div></div>
    <script>
      window.addEventListener('resize', function () {
        document.documentElement.style.setProperty('--scale', String(window.innerWidth / 750));
      });
    </script>
  </body>
</html>`;

assert.strictEqual(hasFixedCanvasScaleLayout(fixedCanvasHtml), true);
assert.deepStrictEqual(inferHtmlDesignSize(fixedCanvasHtml), { width: 750, height: 2758 });

const guarded = ensureViewportSafeHtml(fixedCanvasHtml);
assert.match(guarded, /aps-html-ir-viewport-guard/);
assert.match(guarded, /--aps-page-w:\s*750px/);
assert.match(guarded, /--aps-page-h:\s*2758px/);
assert.match(guarded, /height:\s*auto !important/);
assert.match(guarded, /overflow-y:\s*auto !important/);
assert.match(guarded, /#root > #canvas[\s\S]*transform-origin:\s*top left !important/);
assert.match(guarded, /style\.setProperty\('--scale', String\(scale\)\)/);

const fixedPageHtml = `<!doctype html>
<html>
  <head>
    <style>
      .page {
        position: relative;
        width: 750px;
        height: 1548px;
        overflow: hidden;
      }
    </style>
  </head>
  <body><div id="root"><div class="stage"><main class="page"></main></div></div></body>
</html>`;

assert.strictEqual(hasFixedPagePixelLayout(fixedPageHtml), true);
assert.deepStrictEqual(inferHtmlDesignSize(fixedPageHtml), { width: 750, height: 1548 });
const guardedPage = ensureViewportSafeHtml(fixedPageHtml);
assert.match(guardedPage, /#root > \.stage[\s\S]*transform-origin:\s*top left !important/);
assert.match(guardedPage, /#root > \.stage > \.page[\s\S]*transform:\s*none !important/);

const staleGuardHtml = guardedPage
  .replace('overflow-y: auto !important;', 'overflow-y: hidden !important;')
  .replace('#root > .stage', '#root > .missing-stage');
const rebuiltGuard = ensureViewportSafeHtml(staleGuardHtml);
assert.match(rebuiltGuard, /overflow-y:\s*auto !important/);
assert.match(rebuiltGuard, /#root > \.stage[\s\S]*transform-origin:\s*top left !important/);
assert.doesNotMatch(rebuiltGuard, /overflow-y:\s*hidden !important/);
assert.doesNotMatch(rebuiltGuard, /missing-stage/);
assert.strictEqual((rebuiltGuard.match(/aps-html-ir-viewport-guard/g) || []).length, 2);
assert.doesNotMatch(stripViewportGuard(rebuiltGuard), /aps-html-ir-viewport-guard/);

const normalHtml = '<!doctype html><html><head></head><body><div id="root"><main class="page"></main></div></body></html>';
assert.strictEqual(hasFixedCanvasScaleLayout(normalHtml), false);
assert.strictEqual(hasFixedPagePixelLayout(normalHtml), false);
assert.strictEqual(ensureViewportSafeHtml(normalHtml), normalHtml);

console.log('ai-html-agent viewport tests passed');
