const express = require('express');
const { asyncHandler } = require('../utils');
const { buildAvailableLocalAssetsText, repairHtmlLocalAssetReferences } = require('./assets');
const { extractChatDeltaText } = require('./chat');
const {
  ensureViewportSafeHtml,
  extractHtmlDocument,
  findForbiddenSvgSyntax,
  findMalformedHtmlSyntax,
  hasFixedCanvasScaleLayout,
  hasFixedPagePixelLayout,
  inferHtmlDesignSize,
  normalizeHtml,
  stripViewportGuard
} = require('./html');
const { prepareGenerateJob, prepareRefineJob, runAgentJob } = require('./jobs');
const { createSseWriter, wantsEventStream } = require('./progress');

const router = express.Router();

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
  ensureViewportSafeHtml,
  hasFixedCanvasScaleLayout,
  hasFixedPagePixelLayout,
  inferHtmlDesignSize,
  stripViewportGuard,
  repairHtmlLocalAssetReferences,
  buildAvailableLocalAssetsText
};

module.exports = router;
