/**
 * App Page Studio 服务器
 * 主入口文件
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const { WebSocketServer } = require('ws');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const crypto = require('crypto');

// 导入 API 路由
const projectsRouter = require('./api/projects');
const pagesRouter = require('./api/pages');
const htmlRouter = require('./api/html');
const promptRouter = require('./api/prompt');
const imageRouter = require('./api/image');
const psdRouter = require('./api/psd');
const figmaRouter = require('./api/figma');
const aiHtmlAgentRouter = require('./api/ai');
const authRouter = require('./api/auth');
const { requireAuth } = authRouter;
const { HTML_CACHES_DIR } = require('./api/utils');
const { db, Users, Projects } = require('./db');
const { CLIENT_DIST_DIRS } = require('./paths');

const app = express();
const PORT = 3000;

// 中间件
app.use(express.json({ limit: '50mb' }));

// ===== Session =====
const SESSION_SECRET = "SWtrjZD8{@yv"

const sessionMiddleware = session({
  store: new SqliteStore({ client: db, expired: { clear: true, intervalMs: 15 * 60 * 1000 } }),
  name: 'aps.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 天
  },
});

app.use(sessionMiddleware);

// ===== 引导管理员账号 =====
(function bootstrapAdmin() {
  if (Users.count() > 0) {
    const owner = Users.getFirstAdmin() || Users.getFirst();
    if (owner) Projects.assignLegacyProjectsToUser(owner.id);
    return;
  }
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME || 'admin';
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  let adminId;
  if (!password) {
    const generated = crypto.randomBytes(9).toString('base64url');
    adminId = Users.create({ username, password: generated, role: 'admin' });
    console.log('\n========== 初始管理员账号已创建 ==========');
    console.log(`  用户名: ${username}`);
    console.log(`  密码:   ${generated}`);
    console.log('  请立即登录并修改密码。');
    console.log('==========================================\n');
  } else {
    adminId = Users.create({ username, password, role: 'admin' });
    console.log(`✅ 已根据 env 创建管理员: ${username}`);
  }
  Projects.assignLegacyProjectsToUser(adminId);
})();

// 前端静态服务：使用 Vite 构建产物（打包目录优先，回退 workspace client/dist）
const frontendDist = CLIENT_DIST_DIRS.find(d => fs.existsSync(d));

if (frontendDist) {
  app.use(express.static(frontendDist));
} else {
  console.warn('⚠️  未找到前端构建产物，请先运行 pnpm run build（或开发模式用 pnpm run dev 起 Vite）');
}

// 动态 HTML 静态服务（根据 URL 中的项目 ID 提供文件）
app.use('/html/:projectId', requireAuth, (req, res, next) => {
  const projectId = Number.parseInt(req.params.projectId, 10);
  if (!Number.isFinite(projectId) || projectId <= 0 || !Projects.userCanAccess(projectId, req.authUser)) {
    return res.status(404).send('Project not found');
  }

  const htmlDir = path.join(HTML_CACHES_DIR, String(projectId));
  if (fs.existsSync(htmlDir)) {
    express.static(htmlDir, { dotfiles: 'deny' })(req, res, next);
  } else {
    res.status(404).send('Project not found');
  }
});

// 鉴权路由（公开 /auth/login、/auth/me；其余在 router 内部 requireAdmin）
app.use('/api', authRouter);
app.use('/api', figmaRouter);

// 业务 API 全部要求登录
app.use('/api', requireAuth, projectsRouter);
app.use('/api', requireAuth, pagesRouter);
app.use('/api', requireAuth, htmlRouter);
app.use('/api', requireAuth, promptRouter);
app.use('/api', requireAuth, imageRouter);
app.use('/api', requireAuth, psdRouter);
app.use('/api', requireAuth, aiHtmlAgentRouter);

// SPA fallback：非 API / 非 html 路由返回前端 index.html
if (frontendDist) {
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/html/')) return next();
    const indexPath = path.join(frontendDist, 'index.html');
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
    next();
  });
}

// 全局错误处理：兜底捕获路由抛出的同步异常与 next(err) 传递的错误。
// 生产环境对客户端隐藏原始 message（可能包含路径），开发模式保留原文便于调试。
const IS_DEV = process.env.NODE_ENV !== 'production';
app.use((err, req, res, next) => {
  console.error(`❌ ${req.method} ${req.originalUrl}:`, err);
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  // 4xx 是客户端错误，message 是给用户看的提示，可直接返回；5xx 才脱敏。
  const safeMessage = status < 500
    ? (err.message || '请求参数有误')
    : (IS_DEV ? (err.message || '服务器内部错误') : '服务器内部错误');
  res.status(status).json({ error: safeMessage });
});

// 启动服务器
const server = app.listen(PORT, () => {
  console.log(`\n🚀 App Page Studio 已启动`);
  console.log(`   预览地址: http://localhost:${PORT}`);
  console.log(`   HTML缓存: ${HTML_CACHES_DIR}\n`);
});

// WebSocket：HTML 热更新 + 项目协作 presence
const wss = new WebSocketServer({ noServer: true });
const clients = new Map();

function wsSend(ws, payload) {
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify(payload));
}

function getPresenceList(projectId) {
  return Array.from(clients.values())
    .filter((client) => client.projectId === projectId)
    .map((client) => ({
      connectionId: client.connectionId,
      sessionId: client.sessionId,
      user: client.user,
      pagePath: client.pagePath || null,
      groupId: client.groupId || null,
      scope: client.scope || null,
      updatedAt: client.updatedAt
    }));
}

function broadcastProjectPresence(projectId) {
  if (!projectId) return;
  const payload = {
    type: 'presence:list',
    projectId,
    users: getPresenceList(projectId)
  };
  for (const client of clients.values()) {
    if (client.projectId === projectId) wsSend(client.ws, payload);
  }
}

function broadcastProjectEvent(projectId, payload) {
  if (!projectId) return;
  for (const client of clients.values()) {
    if (client.projectId === projectId) wsSend(client.ws, payload);
  }
}

app.set('broadcastProjectEvent', broadcastProjectEvent);

wss.on('connection', (ws, request) => {
  const user = request.wsUser;
  const client = {
    ws,
    connectionId: crypto.randomUUID(),
    sessionId: request.sessionID,
    user: user ? { id: user.id, username: user.username, role: user.role } : null,
    projectId: null,
    pagePath: null,
    groupId: null,
    scope: null,
    updatedAt: new Date().toISOString()
  };

  clients.set(ws, client);
  wsSend(ws, {
    type: 'session',
    sessionId: client.sessionId,
    connectionId: client.connectionId,
    user: client.user
  });

  ws.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (message.type !== 'presence:join' && message.type !== 'presence:update') return;

    const projectId = Number.parseInt(message.projectId || client.projectId, 10);
    if (!Number.isFinite(projectId) || projectId <= 0) return;
    if (!Projects.userCanAccess(projectId, user)) return;

    const previousProjectId = client.projectId;
    client.projectId = projectId;
    client.pagePath = typeof message.pagePath === 'string' ? message.pagePath : null;
    client.groupId = message.groupId == null ? null : String(message.groupId);
    client.scope = typeof message.scope === 'string' ? message.scope : null;
    client.updatedAt = new Date().toISOString();

    if (previousProjectId && previousProjectId !== projectId) {
      broadcastProjectPresence(previousProjectId);
    }
    broadcastProjectPresence(projectId);
  });

  ws.on('close', () => {
    const projectId = client.projectId;
    clients.delete(ws);
    if (projectId) broadcastProjectPresence(projectId);
  });
});

server.on('upgrade', (request, socket, head) => {
  let pathname = '/';
  try {
    pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  } catch {}
  if (pathname !== '/ws') {
    socket.destroy();
    return;
  }

  const response = {
    getHeader() { return undefined; },
    setHeader() {},
    writeHead() {},
  };
  sessionMiddleware(request, response, () => {
    if (!request.session?.user) {
      socket.destroy();
      return;
    }
    const user = Users.getById(request.session.user.id);
    if (!user) {
      socket.destroy();
      return;
    }
    request.wsUser = { id: user.id, username: user.username, role: user.role };
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });
});

// 监听整个 html_caches 目录的文件变化
let watcher = null;

function setupWatcher() {
  if (watcher) {
    watcher.close();
  }

  if (!fs.existsSync(HTML_CACHES_DIR)) {
    fs.mkdirSync(HTML_CACHES_DIR, { recursive: true });
  }

  watcher = chokidar.watch(HTML_CACHES_DIR, { ignoreInitial: true });
  watcher.on('all', (event, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('.htm') || filePath.endsWith('.psd')) {
      console.log(`📄 ${event}: ${path.basename(filePath)}`);
      const rel = path.relative(HTML_CACHES_DIR, filePath).replace(/\\/g, '/');
      const [projectIdPart, ...rest] = rel.split('/');
      const projectId = Number.parseInt(projectIdPart, 10);
      if (Number.isFinite(projectId) && projectId > 0) {
        broadcastProjectEvent(projectId, {
          type: 'html:changed',
          projectId,
          path: rest.join('/'),
          file: filePath,
          event
        });
      }
    }
  });
}

setupWatcher();

// 自动打开浏览器
if (process.argv.includes('--dev')) {
  import('open').then(({ default: open }) => {
    // 开发模式打开 Vite 前端，生产模式打开后端
    const url = frontendDist
      ? `http://localhost:${PORT}`
      : `http://localhost:5173`;
    open(url);
  });
}
