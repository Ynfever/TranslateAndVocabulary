# 星标功能更新说明

## 功能描述
在单词卡片中，当用户点击等价词/易混淆词或MCQ选项显示定义后，再次点击该词时，将该词标记为荧光黄背景并加入到 Starred Words 中。

## 更新的文件

### 1. `styles/wordCard.css`
- 添加了 `.starred` 样式类
- 荧光黄背景色：`#ffff99`
- 使用 `!important` 确保样式优先级

### 2. `scripts/wordCard.js`
- 更新了 `populateList()` 函数，支持两次点击逻辑：
  - 第一次点击：显示定义
  - 第二次点击：标记为荧光黄并加入 starred words
- 更新了 `displayMCQ()` 函数，支持三次点击逻辑：
  - 第一次点击：显示正确/错误
  - 第二次点击：显示定义
  - 第三次点击：标记为荧光黄并加入 starred words

### 3. `scripts/review.js`
- 同样更新了 `populateList()` 和 `displayMCQ()` 函数
- 保持与单词卡片页面相同的交互逻辑

## 技术实现细节

### 状态管理
使用 `dataset.state` 来跟踪每个词汇项的状态：
- **等价词/易混淆词**：`initial` → `definition-shown` → `starred`
- **MCQ选项**：`unanswered` → `revealed` → `definition-shown` → `starred`

### 数据存储
- 使用 `chrome.storage.local` 存储星标词汇
- 存储格式：`${word}::${timestamp}`
- 与现有的星标系统完全兼容

### 样式变化
- 标记为星标的词汇显示荧光黄背景（`#ffff99`）
- 移除了字体加粗，保持正常字重

## 使用方法

1. **等价词/易混淆词列表**：
   - 点击词汇 → 显示定义
   - 再次点击 → 标记为荧光黄并加入星标

2. **MCQ选项**：
   - 点击选项 → 显示正确/错误状态
   - 再次点击 → 显示定义
   - 第三次点击 → 标记为荧光黄并加入星标

## 兼容性
- 完全兼容现有的星标系统
- 在单词卡片页面和复习页面都可正常工作
- 支持Chrome扩展的本地存储机制

## 问题修复

### ReferenceError: getStarKey is not defined
**问题原因**：`getStarKey`函数定义在DOMContentLoaded事件监听器内部，但`populateList`和`displayMCQ`函数定义在全局作用域中，导致作用域访问错误。

**解决方案**：将`getStarKey(word, timestamp)`的调用替换为内联实现`${word}::${timestamp}`，避免跨作用域访问问题。

**修改文件**：
- `scripts/wordCard.js`: 修复了2处引用错误
- `scripts/review.js`: 修复了2处引用错误

### Starred Words在overview显示10个词，但review仅有8个词的问题
**问题原因**：
1. 通过单词卡片添加的星标词汇使用的是当前时间的timestamp，而review中筛选星标词汇时使用的是原始学习时的timestamp，导致时间戳不匹配。
2. 更重要的是，等价词/易混淆词本身可能从来没有被学习过，所以它们不存在于`learnedItems`中，因此无法在starred words review中被过滤出来。

**根本问题**：Starred words的过滤逻辑错误地依赖于词汇必须存在于原始学习记录中。

**解决方案**：
1. **数据结构升级**：将starred words从字符串数组`["word::timestamp"]`升级为对象数组，包含词汇、时间戳、定义和来源信息
2. **新的存储格式**：
   ```javascript
   {
     word: "vestige",
     timestamp: "1724242933923", 
     definition: "痕迹，残余",
     source: "wordcard" // wordcard, review-list, review-mcq, legacy
   }
   ```
3. **向后兼容**：支持旧格式自动转换为新格式
4. **独立的review逻辑**：starred words review不再依赖于原始学习记录，可以显示任何被标记的词汇

**修改内容**：
- 完全重写starred words的存储和过滤机制
- 更新`wordCard.js`和`review.js`中的所有相关函数
- 添加详细的调试日志来追踪问题
- 支持新旧数据格式的混合处理

**预期结果**：现在通过单词卡片添加的等价词/易混淆词都能正确出现在starred words review中，不再受限于是否在原始学习记录中存在。
