#!/bin/bash
#
# App Page Studio 打包脚本
# 用法:
#   ./pack.sh              # 默认 react 前端
#   ./pack.sh -type react  # React 前端（构建 frontend/dist）
#   ./pack.sh -type html   # 纯 HTML 前端（使用 public/）
#

set -e

# 解析参数
FRONTEND_TYPE="react"
while [[ $# -gt 0 ]]; do
  case "$1" in
    -type)
      FRONTEND_TYPE="$2"
      shift 2
      ;;
    *)
      echo "未知参数: $1"
      echo "用法: ./pack.sh [-type html|react]"
      exit 1
      ;;
  esac
done

# 项目信息
VERSION=$(node -p "require('./package.json').version")
PACK_NAME="app-page-studio-v${VERSION}-${FRONTEND_TYPE}"
DIST_DIR=".pack_tmp/${PACK_NAME}"
RELEASE_DIR="release"
ZIP_FILE="${RELEASE_DIR}/${PACK_NAME}.zip"

echo "📦 打包 App Page Studio v${VERSION} (前端: ${FRONTEND_TYPE})"
echo ""

# 清理
rm -rf .pack_tmp "${ZIP_FILE}"
mkdir -p "${RELEASE_DIR}"
mkdir -p "${DIST_DIR}"

# 后端文件
echo "  复制后端文件..."
cp package.json server.js db.js "${DIST_DIR}/"
cp package-lock.json "${DIST_DIR}/" 2>/dev/null || true
cp pnpm-lock.yaml "${DIST_DIR}/" 2>/dev/null || true
cp -r api "${DIST_DIR}/api"
cp -r schemas "${DIST_DIR}/schemas" 2>/dev/null || true

# 前端文件
if [ "${FRONTEND_TYPE}" = "react" ]; then
  echo "  构建 React 前端..."
  (cd frontend && npx vite build)
  cp -r frontend/dist "${DIST_DIR}/frontend_dist"
  echo "  React 前端已构建并集成"
elif [ "${FRONTEND_TYPE}" = "html" ]; then
  cp -r public "${DIST_DIR}/public"
  echo "  HTML 前端已复制"
else
  echo "❌ 未知前端类型: ${FRONTEND_TYPE}"
  echo "   支持: html, react"
  rm -rf .pack_tmp
  exit 1
fi

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
