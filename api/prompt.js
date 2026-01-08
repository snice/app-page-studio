/**
 * 提示词生成 API 路由
 */

const express = require('express');
const router = express.Router();

// 生成 AI 提示词
router.post('/generate-prompt', (req, res) => {
  const { pages, targetPlatform = 'flutter', designSystem = null } = req.body;
  const prompt = generateAIPrompt(pages, targetPlatform, designSystem);
  res.json({ prompt });
});

/**
 * 生成 AI 提示词
 * @param {Object} pagesConfig - 页面配置
 * @param {string} platform - 目标平台
 * @param {Object|null} designSystem - 设计系统配置
 * @returns {string}
 */
function generateAIPrompt(pagesConfig, platform, designSystem) {
  const platformGuides = {
    flutter: {
      framework: 'Flutter',
      language: 'Dart',
      layoutWidget: 'Column, Row, Stack, ListView',
      stateManagement: 'GetX',
      routing: 'GetX路由管理',
      imageAsset: "Image.asset('assets/images/xxx.png')",
      assetsDir: 'assets/images/',
      createPageCmd: 'get create page:页面名',
      routingGuide: `### GetX 路由管理
- 使用 \`Get.toNamed('/路由名')\` 进行页面跳转
- 使用 \`Get.back()\` 返回上一页
- 路由定义在 \`lib/routes/app_pages.dart\`
- 使用 \`get create page:页面名\` 命令创建新页面
- 页面控制器继承 \`GetxController\`，使用 \`Get.find<Controller>()\` 获取`
    },
    'react-native': {
      framework: 'React Native',
      language: 'TypeScript',
      layoutWidget: 'View, ScrollView, FlatList',
      stateManagement: 'Zustand/Context',
      routing: 'Expo Router',
      imageAsset: "require('@/assets/images/xxx.png')",
      assetsDir: 'assets/images/',
      createPageCmd: '在 app/ 目录下创建文件',
      routingGuide: `### Expo Router 路由管理
- 基于文件系统的路由，页面文件放在 \`app/\` 目录
- 使用 \`router.push('/路由名')\` 或 \`<Link href="/路由名">\` 跳转
- 使用 \`router.back()\` 返回上一页
- 动态路由使用 \`[id].tsx\` 命名
- 布局文件使用 \`_layout.tsx\`
- 如果源码路径不存在，需要在 \`app/\` 目录下自动创建对应文件`
    },
    'uniapp': {
      framework: 'UniApp',
      language: 'Vue 3 + TypeScript',
      layoutWidget: 'view, scroll-view, swiper',
      stateManagement: 'Pinia',
      routing: 'uni-app 路由',
      imageAsset: "'/static/images/xxx.png'",
      assetsDir: 'static/images/',
      createPageCmd: '在 pages/ 目录下创建 .vue 文件并在 pages.json 中注册',
      routingGuide: `### UniApp 路由管理
- 页面文件放在 \`pages/\` 目录，使用 \`.vue\` 后缀
- 所有页面需要在 \`pages.json\` 中注册
- 使用 \`uni.navigateTo({ url: '/pages/xxx/xxx' })\` 跳转
- 使用 \`uni.navigateBack()\` 返回上一页
- 使用 \`uni.switchTab({ url: '/pages/xxx/xxx' })\` 切换 Tab 页面
- 使用 \`uni.redirectTo()\` 关闭当前页面并跳转
- 组件使用 \`<script setup lang="ts">\` 语法
- 样式使用 rpx 单位适配多端`
    }
  };

  const guide = platformGuides[platform] || platformGuides.flutter;

  let prompt = `# ${pagesConfig.projectName || 'App'} - 页面开发指南

## 目标平台
- 框架: ${guide.framework}
- 语言: ${guide.language}
- 布局组件: ${guide.layoutWidget}
- 状态管理: ${guide.stateManagement}
- 路由管理: ${guide.routing}

## ⚠️ 重要注意事项

### 必须忽略的元素
1. **手机状态栏（Status Bar）**：HTML设计稿中顶部的手机状态栏（显示时间、信号、电池等）是设计稿的装饰元素，**不要**在代码中实现，系统会自动处理状态栏。
2. **手机导航栏（Navigation Bar）**：底部的系统导航栏同样忽略。
3. **设备边框**：任何模拟手机外框的元素都要忽略。

### 图片资源处理
在生成代码时，请按以下规则处理图片资源：
1. 检测 HTML 中所有引用的图片（img 标签、background-image 等）
2. 将图片文件复制到项目的 \`${guide.assetsDir}\` 目录
3. 图片文件重命名规则：保持原文件名，如有冲突则添加序号后缀
4. 在代码中使用正确的资源引用方式: \`${guide.imageAsset}\`

${guide.routingGuide}

`;

  // 设计系统
  if (designSystem && Object.keys(designSystem).length > 0) {
    prompt += `## 设计系统
\`\`\`json
${JSON.stringify(designSystem, null, 2)}
\`\`\`

`;
  }

  // 页面分组
  if (pagesConfig.pageGroups && pagesConfig.pageGroups.length > 0) {
    prompt += `## 页面列表\n\n`;

    for (const group of pagesConfig.pageGroups) {
      // 找到属于该分组的文件
      const groupFiles = (pagesConfig.htmlFiles || []).filter(f => f.groupId === group.id);

      // 根据平台获取对应的源码路径，兼容旧数据格式
      let sourcePath = '待创建';
      if (group.sourcePaths && group.sourcePaths[platform]) {
        sourcePath = group.sourcePaths[platform];
      } else if (group.appSourcePath) {
        // 兼容旧数据格式
        sourcePath = group.appSourcePath;
      }
      const sourceNote = sourcePath === '待创建' ? ` ⚠️ 需要使用 \`${guide.createPageCmd}\` 创建` : '';

      prompt += `### ${group.name}
- **描述**: ${group.description || '无'}
- **路由**: \`${group.route || '待定义'}\`
- **源码路径**: \`${sourcePath}\`${sourceNote}

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

        // 显示图片替换
        if (file.imageReplacements && file.imageReplacements.length > 0) {
          prompt += `  - 图片替换:\n`;
          for (const img of file.imageReplacements) {
            const desc = img.description ? ` (${img.description})` : '';
            prompt += `    - \`${img.selector}\` → 替换为图片 \`${img.imagePath || '待指定'}\`${desc}\n`;
          }
        }
      }

      prompt += '\n---\n\n';
    }
  }

  // 单独的 HTML 文件
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
      if (file.imageReplacements && file.imageReplacements.length > 0) {
        prompt += `- 图片替换:\n`;
        for (const img of file.imageReplacements) {
          const desc = img.description ? ` (${img.description})` : '';
          prompt += `  - \`${img.selector}\` → 替换为图片 \`${img.imagePath || '待指定'}\`${desc}\n`;
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
5. **图片资源**：自动检测并复制图片到 \`${guide.assetsDir}\`，使用正确的引用方式
6. **图片替换**：对于标记了"图片替换"的元素，不要还原 HTML 中的内容，直接使用指定的图片替换该区域
7. **响应式**：考虑不同屏幕尺寸的适配
8. **路由创建**：如果源码路径不存在，使用 \`${guide.createPageCmd}\` 创建

## 使用说明

将此提示词与对应的HTML文件一起提供给AI工具（如Cursor），AI将根据设计稿生成${guide.framework}代码。
`;

  return prompt;
}

module.exports = router;
