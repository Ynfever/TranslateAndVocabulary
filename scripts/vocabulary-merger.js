// vocabulary-merger.js - 词汇合并工具

/**
 * 词汇合并管理器
 * 负责处理相同单词在不同句子中的合并逻辑
 */
class VocabularyMerger {
    constructor() {
        this.mergedVocabulary = new Map(); // word -> merged word data
    }

    /**
     * 合并现有词库中的重复单词
     * @param {Array} learnedItems - 现有的学习项目
     * @returns {Array} 合并后的学习项目
     */
    mergeExistingVocabulary(learnedItems) {
        const mergedData = new Map();
        const sentenceMap = new Map(); // 保持句子展示的映射

        // 第一步：收集所有单词和其出现的句子
        learnedItems.forEach((item, itemIndex) => {
            item.selectedWords.forEach(wordData => {
                const wordKey = wordData.word.toLowerCase();
                
                if (!mergedData.has(wordKey)) {
                    mergedData.set(wordKey, {
                        word: wordData.word, // 保持第一次出现时的大小写
                        examples: [],
                        definitions: new Set(),
                        translations: new Set(),
                        firstTimestamp: item.timestamp
                    });
                }

                const merged = mergedData.get(wordKey);
                
                // 添加例句信息
                merged.examples.push({
                    originalText: item.originalText,
                    translation: item.translation,
                    timestamp: item.timestamp,
                    contextTranslation: wordData.translation,
                    definition: wordData.definition
                });

                // 收集所有定义和翻译
                if (wordData.definition) {
                    merged.definitions.add(wordData.definition);
                }
                if (wordData.translation) {
                    merged.translations.add(wordData.translation);
                }
            });

            // 记录句子映射，用于保持main.js中的句子展示
            sentenceMap.set(itemIndex, {
                ...item,
                mergedWords: item.selectedWords.map(w => w.word.toLowerCase())
            });
        });

        // 第二步：创建合并后的词汇表
        this.mergedVocabulary.clear();
        mergedData.forEach((wordData, wordKey) => {
            // 按时间排序例句
            wordData.examples.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            
            // 选择最常用的翻译和定义
            const primaryDefinition = this.selectPrimaryText([...wordData.definitions]);
            const primaryTranslation = this.selectPrimaryText([...wordData.translations]);

            const mergedWord = {
                word: wordData.word,
                definition: primaryDefinition,
                translation: primaryTranslation,
                examples: wordData.examples,
                firstTimestamp: wordData.firstTimestamp,
                totalOccurrences: wordData.examples.length
            };

            this.mergedVocabulary.set(wordKey, mergedWord);
        });

        // 第三步：重构learnedItems以保持句子展示但引用合并后的单词
        const restructuredItems = [];
        sentenceMap.forEach((item, index) => {
            const updatedSelectedWords = item.selectedWords.map(wordData => {
                const wordKey = wordData.word.toLowerCase();
                const merged = this.mergedVocabulary.get(wordKey);
                return {
                    ...wordData,
                    isMerged: merged.totalOccurrences > 1,
                    totalOccurrences: merged.totalOccurrences,
                    mergedWordKey: wordKey
                };
            });

            restructuredItems.push({
                ...item,
                selectedWords: updatedSelectedWords
            });
        });

        return restructuredItems;
    }

    /**
     * 处理新加入的单词，检查是否与现有词汇重复
     * @param {Object} newItem - 新的学习项目
     * @param {Array} existingItems - 现有的学习项目
     * @returns {Object} 处理结果 {updatedItems, mergedWords}
     */
    processNewWords(newItem, existingItems) {
        const result = {
            updatedItems: [...existingItems],
            mergedWords: []
        };

        // 重新构建合并词汇表
        this.mergeExistingVocabulary(existingItems);

        const updatedSelectedWords = [];

        newItem.selectedWords.forEach(wordData => {
            const wordKey = wordData.word.toLowerCase();
            
            if (this.mergedVocabulary.has(wordKey)) {
                // 单词已存在，添加新例句
                const existing = this.mergedVocabulary.get(wordKey);
                
                existing.examples.push({
                    originalText: newItem.originalText,
                    translation: newItem.translation,
                    timestamp: newItem.timestamp,
                    contextTranslation: wordData.translation,
                    definition: wordData.definition
                });

                existing.totalOccurrences = existing.examples.length;

                // 更新定义和翻译集合
                if (wordData.definition) {
                    existing.definitions = existing.definitions || new Set();
                    existing.definitions.add(wordData.definition);
                }
                if (wordData.translation) {
                    existing.translations = existing.translations || new Set();
                    existing.translations.add(wordData.translation);
                }

                // 可能需要更新主要定义和翻译
                existing.definition = this.selectPrimaryText([...existing.definitions]);
                existing.translation = this.selectPrimaryText([...existing.translations]);

                updatedSelectedWords.push({
                    ...wordData,
                    isMerged: true,
                    totalOccurrences: existing.totalOccurrences,
                    mergedWordKey: wordKey
                });

                result.mergedWords.push(wordData.word);
            } else {
                // 新单词
                this.mergedVocabulary.set(wordKey, {
                    word: wordData.word,
                    definition: wordData.definition,
                    translation: wordData.translation,
                    examples: [{
                        originalText: newItem.originalText,
                        translation: newItem.translation,
                        timestamp: newItem.timestamp,
                        contextTranslation: wordData.translation,
                        definition: wordData.definition
                    }],
                    firstTimestamp: newItem.timestamp,
                    totalOccurrences: 1
                });

                updatedSelectedWords.push({
                    ...wordData,
                    isMerged: false,
                    totalOccurrences: 1,
                    mergedWordKey: wordKey
                });
            }
        });

        // 添加新项目
        const newItemWithMergedInfo = {
            ...newItem,
            selectedWords: updatedSelectedWords
        };

        result.updatedItems.push(newItemWithMergedInfo);

        // 重新合并整个词库以保持一致性
        result.updatedItems = this.mergeExistingVocabulary(result.updatedItems);

        return result;
    }

    /**
     * 获取单词的完整信息（包括所有例句）
     * @param {string} word - 单词
     * @returns {Object|null} 合并后的单词数据
     */
    getWordData(word) {
        const wordKey = word.toLowerCase();
        return this.mergedVocabulary.get(wordKey) || null;
    }

    /**
     * 获取所有合并后的词汇
     * @returns {Map} 合并后的词汇表
     */
    getMergedVocabulary() {
        return new Map(this.mergedVocabulary);
    }

    /**
     * 选择主要的文本（定义或翻译）
     * 优先选择最长的或最常出现的
     * @param {Array} texts - 文本数组
     * @returns {string} 选中的主要文本
     */
    selectPrimaryText(texts) {
        if (texts.length === 0) return '';
        if (texts.length === 1) return texts[0];

        // 统计频率
        const frequency = {};
        texts.forEach(text => {
            frequency[text] = (frequency[text] || 0) + 1;
        });

        // 选择频率最高的，如果频率相同则选择最长的
        return texts.sort((a, b) => {
            const freqDiff = frequency[b] - frequency[a];
            if (freqDiff !== 0) return freqDiff;
            return b.length - a.length;
        })[0];
    }

    /**
     * 获取词汇统计信息
     * @returns {Object} 统计信息
     */
    getStatistics() {
        const stats = {
            totalUniqueWords: this.mergedVocabulary.size,
            totalOccurrences: 0,
            wordsWithMultipleExamples: 0,
            averageExamplesPerWord: 0
        };

        this.mergedVocabulary.forEach(wordData => {
            stats.totalOccurrences += wordData.totalOccurrences;
            if (wordData.totalOccurrences > 1) {
                stats.wordsWithMultipleExamples++;
            }
        });

        stats.averageExamplesPerWord = stats.totalUniqueWords > 0 
            ? (stats.totalOccurrences / stats.totalUniqueWords).toFixed(2) 
            : 0;

        return stats;
    }
}

// 导出单例实例
window.VocabularyMerger = VocabularyMerger;
