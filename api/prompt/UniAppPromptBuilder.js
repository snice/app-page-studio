/**
 * UniApp 平台提示词 Builder
 */
const BasePromptBuilder = require('./BasePromptBuilder');

class UniAppPromptBuilder extends BasePromptBuilder {
  getPlatformConfig() {
    return {
      platform: 'uniapp',
      framework: 'UniApp',
      language: 'Vue 3 + TypeScript',
      layoutWidget: 'view, scroll-view, swiper',
      stateManagement: 'Pinia',
      routing: 'uni-app 路由',
      imageAsset: "'/static/images/xxx.png'",
      assetsDir: 'static/images/',
      createPageCmd: '在 pages/ 目录下创建 .vue 文件并在 pages.json 中注册',
    };
  }

  getRoutingGuide() {
    return `### UniApp 路由管理
- 页面文件放在 \`pages/\` 目录，使用 \`.vue\` 后缀
- 所有页面需要在 \`pages.json\` 中注册
- 使用 \`uni.navigateTo({ url: '/pages/xxx/xxx' })\` 跳转
- 使用 \`uni.navigateBack()\` 返回上一页
- 使用 \`uni.switchTab({ url: '/pages/xxx/xxx' })\` 切换 Tab 页面
- 使用 \`uni.redirectTo()\` 关闭当前页面并跳转
- 组件使用 \`<script setup lang="ts">\` 语法
- 样式使用 rpx 单位适配多端`;
  }

  getTabbarImplementation(tabbarItems) {
    const list = tabbarItems
      .map(tab => `    { "pagePath": "${tab.route === '待定义' ? '/index/index' : tab.route}", "text": "${tab.name}", "iconPath": "${tab.iconDefault}", "selectedIconPath": "${tab.iconSelected}" }`)
      .join(',\n');
    return `
### UniApp Tabbar 实现
- 在 \`pages.json\` 中配置 \`tabBar\` 字段
- 设置 \`list\` 数组定义各 Tab 页面
- 图标文件放在 \`static/\` 目录
- 示例配置:
\`\`\`json
"tabBar": {
  "color": "#999",
  "selectedColor": "#333",
  "list": [
${list}
  ]
}
\`\`\`
`;
  }
}

module.exports = UniAppPromptBuilder;
