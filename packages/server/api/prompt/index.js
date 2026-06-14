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
const PLATFORM_ALIASES = {
  reactNative: 'react-native',
  react_native: 'react-native',
  rn: 'react-native',
  'uni-app': 'uniapp',
};

function normalizePlatformValue(platform) {
  if (Array.isArray(platform)) {
    return normalizePlatformValue(platform[0]);
  }
  if (typeof platform !== 'string') return '';
  const value = platform.trim();
  return PLATFORM_ALIASES[value] || value;
}

function resolvePlatform(platform, pagesConfig) {
  const explicit = normalizePlatformValue(platform);
  if (builders[explicit]) return explicit;

  const configured = normalizePlatformValue(pagesConfig?.targetPlatform);
  if (builders[configured]) return configured;

  return DEFAULT_PLATFORM;
}

function getPromptPlatforms() {
  return Object.entries(builders).map(([value, Builder]) => {
    const guide = new Builder({}, null, null).guide;
    return {
      value,
      label: `${guide.framework} (${guide.language})`,
      framework: guide.framework,
      language: guide.language,
    };
  });
}

function createBuilder(platform, pagesConfig, designSystem, statusFilters) {
  const Builder = builders[resolvePlatform(platform, pagesConfig)];
  return new Builder(pagesConfig, designSystem, statusFilters);
}

function generatePrompt(platform, pagesConfig, designSystem, statusFilters) {
  return createBuilder(platform, pagesConfig, designSystem, statusFilters)
    .buildAll()
    .toString();
}

module.exports = {
  DEFAULT_PLATFORM,
  builders,
  createBuilder,
  generatePrompt,
  getPromptPlatforms,
  resolvePlatform,
};
