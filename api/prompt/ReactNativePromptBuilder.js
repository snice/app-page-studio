/**
 * React Native (Expo Router) 平台提示词 Builder
 */
const BasePromptBuilder = require('./BasePromptBuilder');

class ReactNativePromptBuilder extends BasePromptBuilder {
  getPlatformConfig() {
    return {
      platform: 'react-native',
      framework: 'React Native',
      language: 'TypeScript',
      layoutWidget: 'View, ScrollView, FlatList',
      stateManagement: 'Zustand/Context',
      routing: 'Expo Router',
      imageAsset: "require('@/assets/images/xxx.png')",
      assetsDir: 'assets/images/',
      createPageCmd: '在 app/ 目录下创建文件',
    };
  }

  getRoutingGuide() {
    return `### Expo Router 路由管理
- 基于文件系统的路由，页面文件放在 \`app/\` 目录
- 使用 \`router.push('/路由名')\` 或 \`<Link href="/路由名">\` 跳转
- 使用 \`router.back()\` 返回上一页
- 动态路由使用 \`[id].tsx\` 命名
- 布局文件使用 \`_layout.tsx\`
- 如果源码路径不存在，需要在 \`app/\` 目录下自动创建对应文件`;
  }

  getTabbarImplementation(_tabbarItems) {
    return `
### React Native Tabbar 实现
- 使用 Expo Router 的 Tab 布局: \`app/(tabs)/_layout.tsx\`
- 配置 \`<Tabs>\` 组件的 \`tabBarIcon\` 属性
- 图标文件放在 \`${this.guide.assetsDir}\` 目录
`;
  }
}

module.exports = ReactNativePromptBuilder;
