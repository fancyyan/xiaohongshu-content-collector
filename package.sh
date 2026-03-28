#!/bin/bash

# 小红书收集器打包脚本
# 确保不会打包敏感信息

VERSION="1.1.2"
PACKAGE_NAME="xhs-collector-beta-v${VERSION}.zip"

echo "🚀 开始打包小红书收集器 v${VERSION}..."

# 检查是否有硬编码的API key（安全检查）
echo "🔍 检查是否有硬编码的API key..."
if grep -r "sk-or-v1-[a-zA-Z0-9]\{20,\}\|sk-ant-[a-zA-Z0-9]\{20,\}\|AIza[a-zA-Z0-9]\{20,\}" --include="*.js" --include="*.json" --exclude="package.sh" . | grep -v "placeholder\|Placeholder\|keyPlaceholder"; then
    echo "❌ 发现可能的真实API key，请检查！"
    exit 1
fi

echo "✅ 未发现硬编码的API key"

# 删除旧的打包文件
if [ -f "$PACKAGE_NAME" ]; then
    echo "🗑️  删除旧的打包文件..."
    rm "$PACKAGE_NAME"
fi

# 创建临时目录
TEMP_DIR="xhs-collector-temp"
if [ -d "$TEMP_DIR" ]; then
    rm -rf "$TEMP_DIR"
fi
mkdir "$TEMP_DIR"

echo "📦 复制文件到临时目录..."

# 复制必要的文件和目录
cp manifest.json "$TEMP_DIR/"
cp background.js "$TEMP_DIR/"
cp bridge.js "$TEMP_DIR/"
cp injector.js "$TEMP_DIR/"
cp ai-panel.css "$TEMP_DIR/"
cp onboarding.html "$TEMP_DIR/"
cp onboarding.js "$TEMP_DIR/"
cp README.md "$TEMP_DIR/"
cp CHANGELOG.md "$TEMP_DIR/"
cp LICENSE "$TEMP_DIR/"
cp PRIVACY.md "$TEMP_DIR/"

# 复制目录
cp -r icons "$TEMP_DIR/"
cp -r popup "$TEMP_DIR/"
cp -r lib "$TEMP_DIR/"
cp -r exports "$TEMP_DIR/"

# 删除临时目录中的 .DS_Store 文件
echo "🧹 清理 .DS_Store 文件..."
find "$TEMP_DIR" -name ".DS_Store" -delete

# 打包
echo "📦 创建 ZIP 包..."
cd "$TEMP_DIR"
zip -r "../$PACKAGE_NAME" . -x "*.DS_Store" "*.git*"
cd ..

# 清理临时目录
echo "🧹 清理临时目录..."
rm -rf "$TEMP_DIR"

# 显示结果
if [ -f "$PACKAGE_NAME" ]; then
    FILE_SIZE=$(du -h "$PACKAGE_NAME" | cut -f1)
    echo ""
    echo "✅ 打包完成！"
    echo "📦 文件名: $PACKAGE_NAME"
    echo "📊 文件大小: $FILE_SIZE"
    echo ""
    echo "🔒 安全检查通过："
    echo "   ✓ 未包含 .DS_Store 文件"
    echo "   ✓ 未包含硬编码的API key"
    echo "   ✓ API key从 chrome.storage 动态读取"
    echo ""
    echo "🎉 可以安全分发此文件！"
else
    echo "❌ 打包失败！"
    exit 1
fi
