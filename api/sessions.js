/**
 * 编辑会话管理 API 路由
 */

const express = require('express');
const router = express.Router();
const { EditSessions, Projects } = require('../db');
const { getRequestSessionInfo, ensureProjectReadable, sendProjectGuardError } = require('./utils');

function ensureSessionProjectWritable(req, res, projectId) {
  const readable = ensureProjectReadable(req, projectId);
  if (!readable.ok) {
    sendProjectGuardError(res, readable);
    return null;
  }
  if (!Projects.userCanWrite(projectId, req.authUser)) {
    sendProjectGuardError(res, { status: 403, error: '无权编辑此项目' });
    return null;
  }
  return readable.project;
}

// 注册/更新编辑会话
router.post('/session/register', (req, res) => {
  const { projectId, sessionId } = req.body;

  if (!projectId || !sessionId) {
    return res.status(400).json({ error: '缺少必要参数' });
  }

  const project = ensureSessionProjectWritable(req, res, projectId);
  if (!project) return;

  const editorName = getRequestSessionInfo(req).editorName || '匿名用户';
  const result = EditSessions.registerSession(projectId, sessionId, editorName);
  res.json(result);
});

// 心跳更新
router.post('/session/heartbeat', (req, res) => {
  const { projectId, sessionId } = req.body;

  if (!projectId || !sessionId) {
    return res.status(400).json({ error: '缺少必要参数' });
  }

  const project = ensureSessionProjectWritable(req, res, projectId);
  if (!project) return;

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

  const readable = ensureProjectReadable(req, projectId);
  if (!readable.ok) return sendProjectGuardError(res, readable);

  const result = EditSessions.checkSession(projectId, sessionId || '');
  res.json(result);
});

// 释放编辑会话
router.post('/session/release', (req, res) => {
  const { projectId, sessionId } = req.body;

  if (!projectId || !sessionId) {
    return res.status(400).json({ error: '缺少必要参数' });
  }

  const readable = ensureProjectReadable(req, projectId);
  if (!readable.ok) return sendProjectGuardError(res, readable);

  EditSessions.releaseSession(projectId, sessionId);
  res.json({ success: true });
});

// 强制接管会话
router.post('/session/force-acquire', (req, res) => {
  const { projectId, sessionId } = req.body;

  if (!projectId || !sessionId) {
    return res.status(400).json({ error: '缺少必要参数' });
  }

  const project = ensureSessionProjectWritable(req, res, projectId);
  if (!project) return;

  const editorName = getRequestSessionInfo(req).editorName || '匿名用户';
  const result = EditSessions.forceAcquire(projectId, sessionId, editorName);
  res.json(result);
});

module.exports = router;
