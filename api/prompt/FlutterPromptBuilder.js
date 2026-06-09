/**
 * Flutter 平台提示词 Builder
 */
const BasePromptBuilder = require('./BasePromptBuilder');

class FlutterPromptBuilder extends BasePromptBuilder {
  getPlatformConfig() {
    return {
      platform: 'flutter',
      framework: 'Flutter',
      language: 'Dart',
      layoutWidget: 'Column, Row, Stack, ListView',
      stateManagement: 'GetX',
      routing: 'GetX路由管理',
      imageAsset: "Image.asset('assets/images/xxx.png')",
      assetsDir: 'assets/images/',
      createPageCmd: 'get create page:页面名',
    };
  }

  getRoutingGuide() {
    return `### GetX 路由管理
- 使用 \`Get.toNamed('/路由名')\` 进行页面跳转
- 使用 \`Get.back()\` 返回上一页
- 路由定义在 \`lib/routes/app_pages.dart\`
- 使用 \`get create page:页面名\` 命令创建新页面
- 页面控制器继承 \`GetxController\`，使用 \`Get.find<Controller>()\` 获取`;
  }

  getTabbarImplementation(_tabbarItems) {
    return `
### Flutter Tabbar 实现
- 使用 \`BottomNavigationBar\` 或 \`GetX\` 的 Tab 控制
- 图标文件放在 \`${this.guide.assetsDir}\` 目录
- 使用 \`IndexedStack\` 保持页面状态
`;
  }
}

module.exports = FlutterPromptBuilder;
