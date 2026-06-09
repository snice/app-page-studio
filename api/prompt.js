/**
 * 提示词生成 API 路由
 *
 * 业务逻辑已拆分到 api/prompt/ 目录下的 Builder 模块，按平台组织。
 */

const express = require('express');
const router = express.Router();
const { generatePrompt } = require('./prompt/index');

router.post('/generate-prompt', (req, res) => {
  const {
    pages,
    targetPlatform = 'flutter',
    designSystem = null,
    statusFilters = null,
  } = req.body;
  const prompt = generatePrompt(targetPlatform, pages, designSystem, statusFilters);
  res.json({ prompt });
});

module.exports = router;
