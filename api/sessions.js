/**
 * 编辑会话管理 API 路由
 */

const express = require('express');
const router = express.Router();
const { EditSessions, Projects } = require('../db');

// 注册/更新编辑会话
router.post('/session/register', (req, res) => {
  const { projectId, sessionId, editorName } = req.body;

  if (!projectId || !sessionId) {
    return res.status(400).json({ error: '缺少必要参数' });
  }

  const project = Projects.getById(projectId);
  if (!project) {
    return res.status(404).json({ error: '项目不存在' });
  }

  const result = EditSessions.registerSession(projectId, sessionId, editorName || '匿名用户');
  res.json(result);
});

// 心跳更新
router.post('/session/heartbeat', (req, res) => {
  const { projectId, sessionId } = req.body;

  if (!projectId || !sessionId) {
    return res.status(400).json({ error: '缺少必要参数' });
  }

  EditSessions.heartbeat(projectId, sessionId);
  res.json({ success: true });
});

// 检查会话状态
router.get('/session/check', (req, res) => {
  const projectId = parseInt(req.query.projectId);
  const sessionId = req.query.sessionId;

  if (!projectId) {
    return res.status(400).json({ error: '缺少项目 ID' });
  }

  const result = EditSessions.checkSession(projectId, sessionId || '');
  res.json(result);
});

// 释放编辑会话
router.post('/session/release', (req, res) => {
  const { projectId, sessionId } = req.body;

  if (!projectId || !sessionId) {
    return res.status(400).json({ error: '缺少必要参数' });
  }

  EditSessions.releaseSession(projectId, sessionId);
  res.json({ success: true });
});

// 强制接管会话
router.post('/session/force-acquire', (req, res) => {
  const { projectId, sessionId, editorName } = req.body;

  if (!projectId || !sessionId) {
    return res.status(400).json({ error: '缺少必要参数' });
  }

  const project = Projects.getById(projectId);
  if (!project) {
    return res.status(404).json({ error: '项目不存在' });
  }

  const result = EditSessions.forceAcquire(projectId, sessionId, editorName || '匿名用户');
  res.json(result);
});

module.exports = router;
