const express = require('express');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const { WebSocketServer } = require('ws');
const cheerio = require('cheerio');

const app = express();
const PORT = 3000;

// 配置存储
let config = {
  projectPath: '',
  htmlPath: '',
};

const configPath = path.join(__dirname, '.studio-config.json');

// 加载配置
function loadConfig() {
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
}

// 保存配置
function saveConfig() {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

loadConfig();

// 中间件
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 动态HTML静态服务
app.use('/html', (req, res, next) => {
  const htmlDir = config.htmlPath || path.join(__dirname, 'html');
  express.static(htmlDir)(req, res, next);
});

// 获取/设置配置
app.get('/api/config', (req, res) => {
  res.json(config);
});

app.post('/api/config', (req, res) => {
  const { projectPath, htmlPath } = req.body;

  if (projectPath !== undefined) {
    config.projectPath = projectPath;
  }
  if (htmlPath !== undefined) {
    config.htmlPath = htmlPath;
  }

  saveConfig();
  res.json({ success: true, config });
});

// 选择目录（返回目录内容供前端选择）
app.get('/api/browse', (req, res) => {
  const dirPath = req.query.path || process.env.HOME || '/';

  try {
    if (!fs.existsSync(dirPath)) {
      res.json({ error: '路径不存在', path: dirPath, items: [] });
      return;
    }

    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      res.json({ error: '不是目录', path: dirPath, items: [] });
      return;
    }

    const items = fs.readdirSync(dirPath)
      .filter(name => !name.startsWith('.'))
      .map(name => {
        const fullPath = path.join(dirPath, name);
        try {
          const itemStat = fs.statSync(fullPath);
          return {
            name,
            path: fullPath,
            isDirectory: itemStat.isDirectory(),
            size: itemStat.size,
            modified: itemStat.mtime
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

    res.json({
      path: dirPath,
      parent: path.dirname(dirPath),
      items
    });
  } catch (e) {
    res.json({ error: e.message, path: dirPath, items: [] });
  }
});

// pages.json 始终存储在工具目录下
const pagesJsonPath = path.join(__dirname, 'pages.json');

// 获取pages.json
app.get('/api/pages', (req, res) => {
  if (fs.existsSync(pagesJsonPath)) {
    const pages = JSON.parse(fs.readFileSync(pagesJsonPath, 'utf-8'));
    res.json(pages);
  } else {
    res.json({
      projectName: path.basename(config.projectPath || 'My App'),
      targetPlatform: ['flutter'],
      designSystem: {},
      htmlFiles: [],
      pageGroups: []
    });
  }
});

// 保存pages.json
app.post('/api/pages', (req, res) => {
  fs.writeFileSync(pagesJsonPath, JSON.stringify(req.body, null, 2), 'utf-8');
  res.json({ success: true });
});

// 扫描HTML文件
app.get('/api/scan-html', (req, res) => {
  const htmlDir = config.htmlPath || path.join(__dirname, 'html');

  if (!fs.existsSync(htmlDir)) {
    res.json({ files: [], htmlPath: htmlDir });
    return;
  }

  const scanDir = (dir, basePath = '') => {
    const files = [];
    try {
      const items = fs.readdirSync(dir);

      for (const item of items) {
        const fullPath = path.join(dir, item);
        const relativePath = path.join(basePath, item);
        try {
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            files.push(...scanDir(fullPath, relativePath));
          } else if (item.endsWith('.html') || item.endsWith('.htm')) {
            files.push({
              name: item,
              path: relativePath.replace(/\\/g, '/'),
              fullPath: fullPath,
              size: stat.size,
              modified: stat.mtime
            });
          }
        } catch {}
      }
    } catch {}
    return files;
  };

  res.json({ files: scanDir(htmlDir), htmlPath: htmlDir });
});

// 读取HTML内容（用于元素选择器）
app.get('/api/html-content', (req, res) => {
  const htmlDir = config.htmlPath || path.join(__dirname, 'html');
  const htmlPath = path.join(htmlDir, req.query.path);

  if (!fs.existsSync(htmlPath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const html = fs.readFileSync(htmlPath, 'utf-8');
  res.json({ html });
});

// 分析HTML结构
app.get('/api/analyze-html', (req, res) => {
  const htmlDir = config.htmlPath || path.join(__dirname, 'html');
  const htmlPath = path.join(htmlDir, req.query.path);

  if (!fs.existsSync(htmlPath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const html = fs.readFileSync(htmlPath, 'utf-8');
  const $ = cheerio.load(html);

  // 提取颜色
  const colors = new Set();
  const colorRegex = /#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|rgba\([^)]+\)/g;

  $('[style]').each((_, el) => {
    const style = $(el).attr('style') || '';
    const matches = style.match(colorRegex);
    if (matches) matches.forEach(c => colors.add(c));
  });

  // 从style标签提取
  $('style').each((_, el) => {
    const css = $(el).html() || '';
    const matches = css.match(colorRegex);
    if (matches) matches.forEach(c => colors.add(c));
  });

  // 提取可交互元素
  const interactiveElements = [];
  $('button, a, input, textarea, select, [onclick], [role="button"], [class*="btn"], [class*="button"], [class*="link"], [class*="tab"], [class*="nav"]').each((_, el) => {
    const $el = $(el);
    const classes = ($el.attr('class') || '').split(' ').filter(Boolean);

    interactiveElements.push({
      tag: el.tagName.toLowerCase(),
      text: $el.text().trim().substring(0, 50),
      class: $el.attr('class'),
      id: $el.attr('id'),
      selector: generateSelector($, el),
      type: getElementType(el.tagName.toLowerCase(), classes)
    });
  });

  // 页面结构分析
  const structure = {
    hasHeader: $('header, [class*="header"], [class*="nav"]').length > 0,
    hasFooter: $('footer, [class*="footer"], [class*="tabbar"], [class*="tab-bar"]').length > 0,
    hasList: $('ul, ol, [class*="list"]').length > 0,
    hasForm: $('form, input, textarea').length > 0,
    hasModal: $('[class*="modal"], [class*="dialog"], [class*="popup"]').length > 0,
    hasCard: $('[class*="card"]').length > 0
  };

  res.json({
    colors: Array.from(colors),
    interactiveElements,
    structure,
    title: $('title').text() || path.basename(htmlPath, '.html')
  });
});

// 生成CSS选择器
function generateSelector($, el) {
  const $el = $(el);
  const id = $el.attr('id');
  if (id) return `#${id}`;

  const classes = ($el.attr('class') || '').trim().split(/\s+/).filter(Boolean);
  if (classes.length > 0) {
    return `.${classes.slice(0, 2).join('.')}`;
  }

  return el.tagName.toLowerCase();
}

// 获取元素类型
function getElementType(tag, classes) {
  const classStr = classes.join(' ').toLowerCase();

  if (tag === 'button' || classStr.includes('btn') || classStr.includes('button')) return 'button';
  if (tag === 'a' || classStr.includes('link')) return 'link';
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return 'input';
  if (classStr.includes('tab')) return 'tab';
  if (classStr.includes('nav')) return 'navigation';
  if (classStr.includes('card')) return 'card';
  if (classStr.includes('list') || classStr.includes('item')) return 'list-item';

  return 'interactive';
}

// 提取HTML中的图片资源
app.get('/api/extract-images', (req, res) => {
  const htmlDir = config.htmlPath || path.join(__dirname, 'html');
  const htmlPath = path.join(htmlDir, req.query.path);

  if (!fs.existsSync(htmlPath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const html = fs.readFileSync(htmlPath, 'utf-8');
  const $ = cheerio.load(html);
  const images = [];
  const htmlDirPath = path.dirname(htmlPath);

  // 从img标签提取
  $('img').each((_, el) => {
    const src = $(el).attr('src');
    if (src && !src.startsWith('data:') && !src.startsWith('http')) {
      images.push({
        src: src,
        fullPath: path.resolve(htmlDirPath, src),
        alt: $(el).attr('alt') || ''
      });
    }
  });

  // 从CSS background-image提取
  $('[style]').each((_, el) => {
    const style = $(el).attr('style') || '';
    const bgMatch = style.match(/background(?:-image)?:\s*url\(['"]?([^'")\s]+)['"]?\)/g);
    if (bgMatch) {
      bgMatch.forEach(match => {
        const urlMatch = match.match(/url\(['"]?([^'")\s]+)['"]?\)/);
        if (urlMatch && urlMatch[1] && !urlMatch[1].startsWith('data:') && !urlMatch[1].startsWith('http')) {
          images.push({
            src: urlMatch[1],
            fullPath: path.resolve(htmlDirPath, urlMatch[1]),
            alt: ''
          });
        }
      });
    }
  });

  // 从style标签提取
  $('style').each((_, el) => {
    const css = $(el).html() || '';
    const matches = css.matchAll(/url\(['"]?([^'")\s]+)['"]?\)/g);
    for (const match of matches) {
      if (match[1] && !match[1].startsWith('data:') && !match[1].startsWith('http')) {
        images.push({
          src: match[1],
          fullPath: path.resolve(htmlDirPath, match[1]),
          alt: ''
        });
      }
    }
  });

  // 去重
  const uniqueImages = [...new Map(images.map(i => [i.src, i])).values()];

  res.json({ images: uniqueImages });
});

// 复制图片到项目assets目录
app.post('/api/copy-images', (req, res) => {
  const { images, targetDir } = req.body;
  const projectPath = config.projectPath;

  if (!projectPath) {
    res.status(400).json({ error: '请先设置项目路径' });
    return;
  }

  const assetsDir = path.join(projectPath, targetDir || 'assets/images');

  // 创建目录
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  const copied = [];
  const failed = [];

  for (const img of images) {
    try {
      if (fs.existsSync(img.fullPath)) {
        const fileName = path.basename(img.fullPath);
        const targetPath = path.join(assetsDir, fileName);
        fs.copyFileSync(img.fullPath, targetPath);
        copied.push({ src: img.src, target: targetPath });
      } else {
        failed.push({ src: img.src, error: '文件不存在' });
      }
    } catch (e) {
      failed.push({ src: img.src, error: e.message });
    }
  }

  res.json({ copied, failed, assetsDir });
});

// 生成AI提示词
app.post('/api/generate-prompt', (req, res) => {
  const { pages, targetPlatform = 'flutter', includeDesignSystem = false } = req.body;
  const prompt = generateAIPrompt(pages, targetPlatform, includeDesignSystem);
  res.json({ prompt });
});

function generateAIPrompt(pagesConfig, platform, includeDesignSystem) {
  const platformGuides = {
    flutter: {
      framework: 'Flutter',
      language: 'Dart',
      layoutWidget: 'Column, Row, Stack, ListView',
      stateManagement: 'Provider/Riverpod/Bloc',
      imageAsset: "Image.asset('assets/images/xxx.png')",
      assetsDir: 'assets/images/'
    },
    'react-native': {
      framework: 'React Native',
      language: 'TypeScript/JavaScript',
      layoutWidget: 'View, ScrollView, FlatList',
      stateManagement: 'Redux/Zustand/Context',
      imageAsset: "require('./assets/images/xxx.png')",
      assetsDir: 'src/assets/images/'
    }
  };

  const guide = platformGuides[platform] || platformGuides.flutter;

  let prompt = `# ${pagesConfig.projectName || 'App'} - 页面开发指南

## 目标平台
- 框架: ${guide.framework}
- 语言: ${guide.language}
- 布局组件: ${guide.layoutWidget}
- 状态管理: ${guide.stateManagement}

## ⚠️ 重要注意事项

### 必须忽略的元素
1. **手机状态栏（Status Bar）**：HTML设计稿中顶部的手机状态栏（显示时间、信号、电池等）是设计稿的装饰元素，**不要**在代码中实现，系统会自动处理状态栏。
2. **手机导航栏（Navigation Bar）**：底部的系统导航栏同样忽略。
3. **设备边框**：任何模拟手机外框的元素都要忽略。

### 图片资源处理
- HTML中引用的图片已复制到项目的 \`${guide.assetsDir}\` 目录
- 使用方式: \`${guide.imageAsset}\`
- 请根据实际文件名替换图片引用

`;

  // 设计系统（可选）
  if (includeDesignSystem && pagesConfig.designSystem && Object.keys(pagesConfig.designSystem).length > 0) {
    prompt += `## 设计系统（参考）
\`\`\`json
${JSON.stringify(pagesConfig.designSystem, null, 2)}
\`\`\`

`;
  }

  // 页面分组
  if (pagesConfig.pageGroups && pagesConfig.pageGroups.length > 0) {
    prompt += `## 页面列表\n\n`;

    for (const group of pagesConfig.pageGroups) {
      // 找到属于该分组的文件
      const groupFiles = (pagesConfig.htmlFiles || []).filter(f => f.groupId === group.id);

      prompt += `### ${group.name}
- **描述**: ${group.description || '无'}
- **路由**: ${group.route || '待定义'}
- **源码路径**: \`${group.appSourcePath || '待创建'}\`

#### 页面状态
`;

      for (const file of groupFiles) {
        prompt += `- **${file.stateName || file.name}**
  - HTML参考: \`${file.path}\`
  - 描述: ${file.description || ''}
`;

        // 显示交互行为
        if (file.interactions && file.interactions.length > 0) {
          prompt += `  - 交互:\n`;
          for (const interaction of file.interactions) {
            prompt += `    - \`${interaction.selector}\` [${interaction.eventType}]: ${interaction.action}\n`;
          }
        }
      }

      prompt += '\n---\n\n';
    }
  }

  // 单独的HTML文件
  const ungroupedFiles = (pagesConfig.htmlFiles || []).filter(f => !f.groupId);
  if (ungroupedFiles.length > 0) {
    prompt += `## 其他页面（未分组）\n\n`;
    for (const file of ungroupedFiles) {
      prompt += `### ${file.stateName || file.name}
- HTML: \`${file.path}\`
- 描述: ${file.description || '待补充'}
`;
      if (file.interactions && file.interactions.length > 0) {
        prompt += `- 交互:\n`;
        for (const i of file.interactions) {
          prompt += `  - \`${i.selector}\` [${i.eventType}]: ${i.action}\n`;
        }
      }
      prompt += '\n';
    }
  }

  prompt += `
## 开发指引

1. **严格按照HTML设计稿还原UI**：布局、颜色、字体、间距等视觉元素
2. **忽略状态栏**：不要实现HTML中的手机状态栏元素（时间、信号、电池图标等）
3. **状态切换**：同一页面的不同状态使用条件渲染实现
4. **交互实现**：根据交互描述实现点击、滑动等事件处理
5. **图片资源**：使用 \`${guide.assetsDir}\` 目录下的图片文件
6. **响应式**：考虑不同屏幕尺寸的适配

## 使用说明

将此提示词与对应的HTML文件一起提供给AI工具（如Cursor），AI将根据设计稿生成${guide.framework}代码。
`;

  return prompt;
}

// 启动服务器
const server = app.listen(PORT, () => {
  console.log(`\n🚀 App Page Studio 已启动`);
  console.log(`   预览地址: http://localhost:${PORT}`);
  console.log(`   项目路径: ${config.projectPath || '未设置'}`);
  console.log(`   HTML路径: ${config.htmlPath || '默认 (./html)'}\n`);
});

// WebSocket 热更新
const wss = new WebSocketServer({ server });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
});

// 监听文件变化
let watcher = null;

function setupWatcher() {
  if (watcher) {
    watcher.close();
  }

  const htmlDir = config.htmlPath || path.join(__dirname, 'html');
  if (!fs.existsSync(htmlDir)) {
    return;
  }

  watcher = chokidar.watch(htmlDir, { ignoreInitial: true });
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

// 配置更新时重新设置watcher
const originalSaveConfig = saveConfig;
saveConfig = function() {
  originalSaveConfig();
  setupWatcher();
};

// 自动打开浏览器
if (process.argv.includes('--dev')) {
  import('open').then(({ default: open }) => {
    open(`http://localhost:${PORT}`);
  });
}
