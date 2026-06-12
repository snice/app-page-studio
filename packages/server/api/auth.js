/**
 * 鉴权 API：登录、登出、当前用户、管理员管理用户
 */
const express = require('express');
const router = express.Router();
const { Users } = require('../db');

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const loginAttempts = new Map();

function publicUser(u) {
  return { id: u.id, username: u.username, role: u.role, createdAt: u.created_at, updatedAt: u.updated_at };
}

function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: '未登录' });
  const user = Users.getById(req.session.user.id);
  if (!user) {
    req.session.destroy(() => res.status(401).json({ error: '账号已被删除' }));
    return;
  }
  req.session.user = { id: user.id, username: user.username, role: user.role };
  req.authUser = req.session.user;
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.authUser.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
    next();
  });
}

function attemptKey(req, username) {
  return `${req.ip || req.socket?.remoteAddress || 'unknown'}:${String(username).toLowerCase()}`;
}

function getAttempt(key) {
  const current = loginAttempts.get(key);
  if (!current) return { count: 0, firstAt: Date.now() };
  if (Date.now() - current.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
    return { count: 0, firstAt: Date.now() };
  }
  return current;
}

function recordLoginFailure(key) {
  const current = getAttempt(key);
  loginAttempts.set(key, { count: current.count + 1, firstAt: current.firstAt });
}

router.post('/auth/login', (req, res, next) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });

  const normalizedUsername = String(username).trim();
  const key = attemptKey(req, normalizedUsername);
  const attempt = getAttempt(key);
  if (attempt.count >= LOGIN_MAX_ATTEMPTS) {
    return res.status(429).json({ error: '登录尝试过多，请稍后再试' });
  }

  const user = Users.getByUsername(normalizedUsername);
  if (!user || !Users.verifyPassword(String(password), user.password_hash)) {
    recordLoginFailure(key);
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  loginAttempts.delete(key);
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.user = { id: user.id, username: user.username, role: user.role };
    req.session.save((saveErr) => {
      if (saveErr) return next(saveErr);
      res.json({ user: publicUser(user) });
    });
  });
});

router.post('/auth/logout', (req, res) => {
  req.session?.destroy(() => {
    res.clearCookie('aps.sid');
    res.json({ success: true });
  });
});

router.get('/auth/me', (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: '未登录' });
  const user = Users.getById(req.session.user.id);
  if (!user) return req.session.destroy(() => res.status(401).json({ error: '账号已被删除' }));
  req.session.user = { id: user.id, username: user.username, role: user.role };
  res.json({ user: publicUser(user) });
});

// ===== 管理员：用户管理 =====
router.get('/auth/users', requireAdmin, (req, res) => {
  res.json({ users: Users.list() });
});

router.post('/auth/users', requireAdmin, (req, res) => {
  const { username, password, role } = req.body || {};
  const normalizedUsername = String(username || '').trim();
  if (!normalizedUsername || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
  if (!/^[a-zA-Z0-9_-]{2,32}$/.test(normalizedUsername)) {
    return res.status(400).json({ error: '用户名仅支持 2-32 位字母、数字、下划线或横线' });
  }
  if (String(password).length < 6) return res.status(400).json({ error: '密码至少 6 位' });
  if (role && role !== 'admin' && role !== 'user') return res.status(400).json({ error: 'role 非法' });
  if (Users.getByUsername(normalizedUsername)) return res.status(409).json({ error: '用户名已存在' });
  const id = Users.create({ username: normalizedUsername, password: String(password), role: role || 'user' });
  res.json({ user: publicUser(Users.getById(id)) });
});

router.put('/auth/users/:id', requireAdmin, (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const user = Users.getById(id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const { password, role } = req.body || {};
  if (password) {
    if (String(password).length < 6) return res.status(400).json({ error: '密码至少 6 位' });
    Users.updatePassword(id, String(password));
  }
  if (role) {
    if (role !== 'admin' && role !== 'user') return res.status(400).json({ error: 'role 非法' });
    // 防止取消最后一个管理员
    if (user.role === 'admin' && role !== 'admin') {
      const admins = Users.list().filter(u => u.role === 'admin');
      if (admins.length <= 1) return res.status(400).json({ error: '至少保留一名管理员' });
    }
    Users.updateRole(id, role);
  }
  res.json({ user: publicUser(Users.getById(id)) });
});

router.delete('/auth/users/:id', requireAdmin, (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const user = Users.getById(id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  if (req.session.user.id === id) return res.status(400).json({ error: '不能删除自己' });
  if (user.role === 'admin') {
    const admins = Users.list().filter(u => u.role === 'admin');
    if (admins.length <= 1) return res.status(400).json({ error: '至少保留一名管理员' });
  }
  Users.delete(id);
  res.json({ success: true });
});

module.exports = router;
module.exports.requireAuth = requireAuth;
module.exports.requireAdmin = requireAdmin;
