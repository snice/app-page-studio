/**
 * 页面配置 API 路由
 */

const express = require('express');
const router = express.Router();
const { Projects } = require('./utils');

// 获取 pages.json（从 SQLite 读取）
router.get('/pages', (req, res) => {
  const projectId = parseInt(req.query.projectId);

  if (projectId) {
    const project = Projects.getById(projectId);
    if (project) {
      const pagesConfig = Projects.getPagesJson(projectId);
      if (pagesConfig) {
        return res.json(pagesConfig);
      }
      // 返回默认配置（带项目名称）
      return res.json({
        projectName: project.name,
        targetPlatform: ['flutter'],
        designSystem: {},
        sharedComponents: [],
        htmlFiles: [],
        pageGroups: []
      });
    }
  }

  // 返回默认配置
  res.json({
    projectName: 'My App',
    targetPlatform: ['flutter'],
    designSystem: {},
    sharedComponents: [],
    htmlFiles: [],
    pageGroups: []
  });
});

// 保存 pages.json（到 SQLite）
router.post('/pages', (req, res) => {
  const projectId = parseInt(req.query.projectId);

  if (!projectId) {
    return res.status(400).json({ error: '请先选择项目' });
  }

  const project = Projects.getById(projectId);
  if (!project) {
    return res.status(404).json({ error: '项目不存在' });
  }

  Projects.savePagesJson(projectId, req.body);
  res.json({ success: true });
});

module.exports = router;
