/**
 * 提示词 Builder 注册表 / 工厂
 *
 * 新增平台流程：
 *   1. 新建 XxxPromptBuilder.js（继承 BasePromptBuilder）
 *   2. 在下方 builders 中注册：'xxx': XxxPromptBuilder
 */
const FlutterPromptBuilder = require('./FlutterPromptBuilder');
const ReactNativePromptBuilder = require('./ReactNativePromptBuilder');
const UniAppPromptBuilder = require('./UniAppPromptBuilder');

const builders = {
  flutter: FlutterPromptBuilder,
  'react-native': ReactNativePromptBuilder,
  uniapp: UniAppPromptBuilder,
};

const DEFAULT_PLATFORM = 'flutter';

function createBuilder(platform, pagesConfig, designSystem, statusFilters) {
  const Builder = builders[platform] || builders[DEFAULT_PLATFORM];
  return new Builder(pagesConfig, designSystem, statusFilters);
}

function generatePrompt(platform, pagesConfig, designSystem, statusFilters) {
  return createBuilder(platform, pagesConfig, designSystem, statusFilters)
    .buildAll()
    .toString();
}

module.exports = {
  builders,
  createBuilder,
  generatePrompt,
};
