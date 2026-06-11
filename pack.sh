#!/bin/bash
#
# App Page Studio 打包脚本
# 用法:
#   ./pack.sh   # 构建 React 前端（frontend/dist）并打包后端
#

set -e

# 项目信息
VERSION=$(node -p "require('./package.json').version")
PACK_NAME="app-page-studio-v${VERSION}"
DIST_DIR=".pack_tmp/${PACK_NAME}"
RELEASE_DIR="release"
ZIP_FILE="${RELEASE_DIR}/${PACK_NAME}.zip"

echo "📦 打包 App Page Studio v${VERSION}"
echo ""

# 清理
rm -rf .pack_tmp "${ZIP_FILE}"
mkdir -p "${RELEASE_DIR}"
mkdir -p "${DIST_DIR}"

# 后端文件
echo "  复制后端文件..."
cp server.js db.js "${DIST_DIR}/"
cp package-lock.json "${DIST_DIR}/" 2>/dev/null || true
cp pnpm-lock.yaml "${DIST_DIR}/" 2>/dev/null || true
# 精简 package.json：只保留 start 脚本
node -e "
  const pkg = require('./package.json');
  pkg.scripts = { start: pkg.scripts.start, postinstall: pkg.scripts.postinstall };
  require('fs').writeFileSync('${DIST_DIR}/package.json', JSON.stringify(pkg, null, 2) + '\n');
"
cp -r api "${DIST_DIR}/api"
cp -r schemas "${DIST_DIR}/schemas" 2>/dev/null || true

# 前端文件
echo "  构建 React 前端..."
(cd frontend && npx vite build)
cp -r frontend/dist "${DIST_DIR}/frontend_dist"
echo "  React 前端已构建并集成"

# 生成启动说明
cat > "${DIST_DIR}/README.txt" << 'EOF'
App Page Studio
===============

启动方式:
  1. npm install
  2. npm start
  3. 浏览器打开 http://localhost:3000

EOF

# 打包 zip
echo "  生成 ${ZIP_FILE}..."
(cd .pack_tmp && zip -rq "../${ZIP_FILE}" "${PACK_NAME}")

# 清理临时目录
rm -rf .pack_tmp

# 显示结果
SIZE=$(du -h "${ZIP_FILE}" | cut -f1)
echo ""
echo "✅ 打包完成: ${ZIP_FILE} (${SIZE})"
