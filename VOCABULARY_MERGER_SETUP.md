# 词汇合并功能升级指南

## 🎯 功能简介

新的词汇合并功能可以：
- ✅ 自动合并相同单词在不同句子中的出现
- ✅ 在单词卡片中显示该单词的所有例句和语境
- ✅ 保持原有界面和使用方式不变
- ✅ 提供更丰富的学习体验

## 📦 安装步骤

### 1. 文件更新
确保以下文件已更新：
- ✅ `scripts/vocabulary-merger.js` (新增)
- ✅ `scripts/main.js` (已修改)
- ✅ `scripts/content.js` (已修改) 
- ✅ `scripts/wordCard.js` (已修改)
- ✅ `manifest.json` (已修改)
- ✅ `views/main.html` (已修改)
- ✅ `views/wordCard.html` (已修改)
- ✅ `views/review.html` (已修改)
- ✅ `styles/main.css` (已修改)
- ✅ `styles/wordCard.css` (已修改)

### 2. 重新加载扩展
1. 在Chrome中打开 `chrome://extensions/`
2. 找到你的翻译扩展
3. 点击"重新加载"按钮

### 3. 数据迁移（首次使用）

#### 方式一：自动迁移
直接打开主页面，系统会自动检测并进行数据迁移。

#### 方式二：手动迁移（推荐）
1. 打开 `migrate_vocabulary_merger.html`
2. 点击"Analyze Current Data"分析现有数据
3. 如有重复单词，点击"Start Migration"开始迁移
4. 等待迁移完成

## 🎨 新功能说明

### 主页面变化
- **绿色边框单词**：表示该单词在多个句子中出现过
- **数字标识**：显示单词的总出现次数，如 `word (3)`
- **点击行为**：有多个例句的单词会打开合并卡片

### 单词卡片变化
- **例句列表**：显示该单词在所有句子中的出现
- **时间排序**：按添加时间顺序显示
- **语境信息**：每个例句包含原文、翻译、语境定义
- **展开收起**：超过3个例句时可以展开查看全部

## 🔧 测试验证

使用 `test_vocabulary_merger.html` 进行测试：
1. 创建测试数据
2. 验证合并功能
3. 检查数据一致性

## 📊 数据结构

### 新增存储项
```javascript
// 合并词汇表
mergedVocabulary: {
  "word1": {
    word: "word1",
    definition: "主要定义", 
    translation: "主要翻译",
    examples: [
      {
        originalText: "句子1",
        translation: "翻译1", 
        timestamp: "时间戳1",
        contextTranslation: "语境翻译1",
        definition: "语境定义1"
      },
      // ... 更多例句
    ],
    totalOccurrences: 2
  }
}
```

### 保留数据
- ✅ `learnedItems` - 完全保留，确保向后兼容
- ✅ `starredWords` - 完全保留
- ✅ `reviewProgress_*` - 完全保留

## 🚨 注意事项

1. **首次迁移**：第一次使用时会进行数据迁移，可能需要几秒钟
2. **存储空间**：会增加一些存储空间用于合并词汇表
3. **向后兼容**：所有现有功能和数据都会保留
4. **备份安全**：迁移过程会自动创建备份

## 🛠️ 故障排除

### 问题1：迁移失败
**解决方案**：
1. 打开 `migrate_vocabulary_merger.html`
2. 点击"Restore from Backup"恢复数据
3. 重新尝试迁移

### 问题2：单词显示异常
**解决方案**：
1. 打开 `migrate_vocabulary_merger.html`
2. 点击"Validate Data Integrity"检查数据
3. 如有问题，点击"Force Re-merge All Data"

### 问题3：性能问题
**解决方案**：
1. 如果词汇量很大（>1000个单词），初始化可能较慢
2. 这是正常现象，只在第一次迁移时发生

## 📈 后续优化

系统会持续优化以下方面：
- 🔄 更智能的定义和翻译选择
- 📊 更详细的学习统计
- 🎯 更好的例句排序和展示
- 💾 更高效的存储和查询

## 🆘 获取帮助

如遇到问题，请：
1. 首先使用测试页面进行诊断
2. 查看浏览器控制台的错误信息
3. 使用迁移工具的备份和恢复功能

祝使用愉快！🎉
