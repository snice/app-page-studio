# App Page Studio

一个用于将设计稿 HTML 转换为 AI 开发提示词的工具，帮助快速还原 Flutter / React Native 页面。

## 功能特性

- **HTML 预览** - 在模拟手机框架中实时预览设计稿 HTML
- **多状态管理** - 将多个 HTML 文件分组为同一页面的不同状态（默认、加载中、空数据等）
- **元素选择器** - 类似浏览器 DevTools 的元素选择功能，定义交互行为
- **智能分析** - 自动提取页面结构、颜色、可交互元素
- **提示词生成** - 生成结构化的 AI 提示词，用于 Cursor 等工具还原页面
- **图片提取** - 自动从 HTML 中提取图片资源到项目目录
- **多项目管理** - 支持多个项目快速切换

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动服务

```bash
npm start
```

访问 http://localhost:3000

## 使用流程

1. **选择项目** - 点击顶部项目选择器，添加或切换项目
2. **配置 HTML** - 将蓝湖等工具导出的 HTML 文件放入项目的 `html/` 目录
3. **创建分组** - 将相关 HTML 文件分组为同一页面的不同状态
4. **配置交互** - 使用元素选择器定义按钮、输入框等交互行为
5. **生成提示词** - 点击「生成提示词」导出 AI 可读的页面描述

## 项目结构

```
your-project/
├── html/                    # 设计稿 HTML 文件
│   ├── home_default.html
│   ├── home_loading.html
│   └── ...
├── pages.json               # 页面配置文件
└── assets/images/           # 提取的图片资源
```

## pages.json 配置

```json
{
  "appName": "我的应用",
  "pageGroups": [
    {
      "id": "home",
      "name": "首页",
      "description": "应用主页面",
      "route": "/home",
      "sourcePath": "lib/pages/home_page.dart",
      "color": "#6366f1",
      "files": ["home_default.html", "home_loading.html"]
    }
  ],
  "htmlFiles": [
    {
      "path": "home_default.html",
      "stateName": "默认状态",
      "description": "正常显示数据",
      "groupId": "home",
      "interactions": [
        {
          "selector": ".btn-submit",
          "eventType": "tap",
          "action": "提交表单"
        }
      ]
    }
  ]
}
```

## 技术栈

- **后端**: Node.js + Express
- **前端**: 原生 HTML/CSS/JS
- **HTML 解析**: Cheerio
- **热更新**: WebSocket + Chokidar

## License

MIT
