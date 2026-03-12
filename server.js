/**
 * App Page Studio 服务器
 * 主入口文件
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const { WebSocketServer } = require('ws');

// 导入 API 路由
const projectsRouter = require('./api/projects');
const pagesRouter = require('./api/pages');
const htmlRouter = require('./api/html');
const promptRouter = require('./api/prompt');
const imageRouter = require('./api/image');
const sessionsRouter = require('./api/sessions');
const { HTML_CACHES_DIR } = require('./api/utils');

const app = express();
const PORT = 3000;

// 中间件
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 动态 HTML 静态服务（根据 URL 中的项目 ID 提供文件）
app.use('/html/:projectId', (req, res, next) => {
  const projectId = req.params.projectId;
  const htmlDir = path.join(HTML_CACHES_DIR, projectId);
  if (fs.existsSync(htmlDir)) {
    express.static(htmlDir)(req, res, next);
  } else {
    res.status(404).send('Project not found');
  }
});

// 挂载 API 路由
app.use('/api', projectsRouter);
app.use('/api', pagesRouter);
app.use('/api', htmlRouter);
app.use('/api', promptRouter);
app.use('/api', imageRouter);
app.use('/api', sessionsRouter);

// 启动服务器
const server = app.listen(PORT, () => {
  console.log(`\n🚀 App Page Studio 已启动`);
  console.log(`   预览地址: http://localhost:${PORT}`);
  console.log(`   HTML缓存: ${HTML_CACHES_DIR}\n`);
});

// WebSocket 热更新
const wss = new WebSocketServer({ server });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
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
    if (filePath.endsWith('.html') || filePath.endsWith('.htm')) {
      console.log(`📄 ${event}: ${path.basename(filePath)}`);
      clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({ type: 'reload', file: filePath }));
        }
      });
    }
  });
}

setupWatcher();

// 自动打开浏览器
if (process.argv.includes('--dev')) {
  import('open').then(({ default: open }) => {
    open(`http://localhost:${PORT}`);
  });
}
