/**
 * 提示词生成 API 路由
 *
 * 业务逻辑已拆分到 api/prompt/ 目录下的 Builder 模块，按平台组织。
 */

const express = require('express');
const router = express.Router();
const {
  DEFAULT_PLATFORM,
  generatePrompt,
  getPromptPlatforms,
  resolvePlatform,
} = require('./prompt/index');

router.get('/prompt-platforms', (_req, res) => {
  res.json({
    platforms: getPromptPlatforms(),
    defaultPlatform: DEFAULT_PLATFORM,
  });
});

router.post('/generate-prompt', (req, res) => {
  const {
    pages,
    targetPlatform = null,
    designSystem = null,
    statusFilters = null,
  } = req.body;
  const platform = resolvePlatform(targetPlatform, pages);
  const prompt = generatePrompt(platform, pages, designSystem, statusFilters);
  res.json({ prompt, targetPlatform: platform });
});

module.exports = router;
