document.addEventListener('DOMContentLoaded', () => {
    const backButton = document.getElementById('back-button');
    const nextButton = document.getElementById('next-button');
    const currentWordEl = document.getElementById('current-word');
    const totalWordsEl = document.getElementById('total-words');
    const unitInfoEl = document.getElementById('unit-info');
    const wordCardContainer = document.getElementById('word-card-container');
    const starBtn = document.getElementById('star-btn');

    // Word card elements
    const wordElement = document.getElementById('word');
    const definitionElement = document.getElementById('definition');
    const equivalentWordsList = document.getElementById('equivalent-words-list');
    const confusableWordsList = document.getElementById('confusable-words-list');
    const exampleContainer = document.getElementById('example-container');
    const mcqContainer = document.getElementById('mcq-container');
    const exampleTextElement = document.getElementById('example-text');
    const mcqQuestionElement = document.getElementById('mcq-question');
    const mcqOptionsListElement = document.getElementById('mcq-options-list');

    definitionElement.addEventListener('click', () => {
        definitionElement.classList.remove('blurred');
    });

    let allWords = [];
    let currentIndex = 0;
    let apiKey = '';
    let cardDataCache = new Map();
    const PRELOAD_COUNT = 3;

    // Star functionality
    function refreshStarUI(isStarred) {
        const currentStarBtn = document.getElementById('star-btn');
        currentStarBtn.setAttribute('aria-pressed', String(isStarred));
        currentStarBtn.title = isStarred ? 'Unstar' : 'Star';
    }

    function getStarKey(word, timestamp) { 
        return `${word}::${timestamp}`; 
    }

    function initStar(word, timestamp) {
        chrome.storage.local.get({ starredWords: [] }, ({ starredWords }) => {
            const set = new Set(starredWords || []);
            const key = getStarKey(word, timestamp);
            refreshStarUI(set.has(key));
            
            // Remove existing event listener by cloning
            const currentStarBtn = document.getElementById('star-btn');
            const newStarBtn = currentStarBtn.cloneNode(true);
            currentStarBtn.parentNode.replaceChild(newStarBtn, currentStarBtn);
            
            newStarBtn.addEventListener('click', () => {
                chrome.storage.local.get({ starredWords: [] }, ({ starredWords }) => {
                    const currentSet = new Set(starredWords || []);
                    const has = currentSet.has(key);
                    if (has) {
                        currentSet.delete(key);
                    } else {
                        currentSet.add(key);
                    }
                    const arr = Array.from(currentSet);
                    chrome.storage.local.set({ starredWords: arr }, () => {
                        refreshStarUI(!has);
                    });
                });
            });
        });
    }

    // Review progress functionality
    function saveReviewProgress(mode, index) {
        const progressKey = `reviewProgress_${mode}`;
        chrome.storage.local.set({ [progressKey]: index });
    }

    function getReviewProgress(mode, callback) {
        const progressKey = `reviewProgress_${mode}`;
        chrome.storage.local.get({ [progressKey]: 0 }, (data) => {
            callback(data[progressKey] || 0);
        });
    }

    // Unit completion and navigation functions
    function showUnitCompletionDialog() {
        const params = new URLSearchParams(location.search);
        const currentUnit = Math.max(1, parseInt(params.get('unit') || '1', 10));
        
        // Get total number of units
        chrome.storage.local.get({ learnedItems: [] }, ({ learnedItems }) => {
            const totalWords = learnedItems.reduce((n, it) => n + (it.selectedWords?.length || 0), 0);
            const totalUnits = Math.ceil(totalWords / 20);
            
            if (currentUnit < totalUnits) {
                // There are more units available
                showNextUnitDialog(currentUnit + 1, totalUnits);
            } else {
                // This was the last unit
                showAllUnitsCompletedDialog();
            }
        });
    }

    function showNextUnitDialog(nextUnit, totalUnits) {
        const dialog = document.createElement('div');
        dialog.className = 'unit-completion-dialog';
        dialog.innerHTML = `
            <div class="dialog-overlay">
                <div class="dialog-content">
                    <h2>🎉 Unit 完成!</h2>
                    <p>恭喜完成当前单元的学习!</p>
                    <p>是否进入 Unit ${nextUnit}?</p>
                    <div class="dialog-buttons">
                        <button id="go-next-unit" class="primary-btn">进入 Unit ${nextUnit} <span class="shortcut">(Enter)</span></button>
                        <button id="stay-current-unit" class="secondary-btn">继续当前Unit <span class="shortcut">(Esc)</span></button>
                        <button id="back-to-main" class="secondary-btn">返回主页</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        // Add keyboard support
        const handleKeydown = (event) => {
            if (event.key === 'Enter') {
                document.getElementById('go-next-unit').click();
            } else if (event.key === 'Escape') {
                document.getElementById('stay-current-unit').click();
            }
        };
        document.addEventListener('keydown', handleKeydown);
        
        // Button event listeners
        document.getElementById('go-next-unit').addEventListener('click', () => {
            document.removeEventListener('keydown', handleKeydown);
            goToNextUnit(nextUnit);
            document.body.removeChild(dialog);
        });
        
        document.getElementById('stay-current-unit').addEventListener('click', () => {
            document.removeEventListener('keydown', handleKeydown);
            // Continue in current unit, loop back to first word
            currentIndex = 0;
            updateReviewState();
            document.body.removeChild(dialog);
        });
        
        document.getElementById('back-to-main').addEventListener('click', () => {
            document.removeEventListener('keydown', handleKeydown);
            window.location.href = '../views/main.html';
        });
    }

    function showAllUnitsCompletedDialog() {
        const dialog = document.createElement('div');
        dialog.className = 'unit-completion-dialog';
        dialog.innerHTML = `
            <div class="dialog-overlay">
                <div class="dialog-content">
                    <h2>🎊 所有Unit已完成!</h2>
                    <p>恭喜你完成了所有单元的学习!</p>
                    <p>你可以继续复习当前Unit或返回主页。</p>
                    <div class="dialog-buttons">
                        <button id="continue-review" class="primary-btn">继续复习 <span class="shortcut">(Enter)</span></button>
                        <button id="back-to-main" class="secondary-btn">返回主页 <span class="shortcut">(Esc)</span></button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        // Add keyboard support
        const handleKeydown = (event) => {
            if (event.key === 'Enter') {
                document.getElementById('continue-review').click();
            } else if (event.key === 'Escape') {
                document.getElementById('back-to-main').click();
            }
        };
        document.addEventListener('keydown', handleKeydown);
        
        document.getElementById('continue-review').addEventListener('click', () => {
            document.removeEventListener('keydown', handleKeydown);
            // Continue reviewing current unit from the beginning
            currentIndex = 0;
            updateReviewState();
            document.body.removeChild(dialog);
        });
        
        document.getElementById('back-to-main').addEventListener('click', () => {
            document.removeEventListener('keydown', handleKeydown);
            window.location.href = '../views/main.html';
        });
    }

    function goToNextUnit(unitNumber) {
        // Reset progress for the new unit
        saveReviewProgress('unit', 0);
        
        // Navigate to next unit
        const url = new URL(location.href);
        url.searchParams.set('unit', unitNumber);
        window.location.href = url.toString();
    }

    // Helper function to get local date key - same as in main.js
    function getLocalDateKey(ts) {
        const d = new Date(ts);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function loadWords() {
        const params = new URLSearchParams(location.search);
        const mode = params.get('mode') || 'total';
        const mockLearnedItems = [
            {
                "timestamp": 1724242933922,
                "originalText": "His political view, harking back to the turmoil in the 1934, is a _____ with no bearing on the present. prototype pretense paradigm relic contradiction vestige",
                "selectedWords": [
                    { "word": "relic", "definition": "遗迹" },
                    { "word": "vestige", "definition": "痕迹" }
                ]
            },
            {
                "timestamp": 1724242933923,
                "originalText": "The museum displayed an ancient pottery shard, a relic from a long-lost civilization.",
                "selectedWords": [
                    { "word": "shard", "definition": "碎片" }
                ]
            }
        ];

        chrome.storage.local.get(['learnedItems', 'geminiApiKey', 'starredWords', 'mergedVocabulary'], (data) => {
            apiKey = data.geminiApiKey;
            let learnedItems = data.learnedItems || [];
            const mergedVocabulary = data.mergedVocabulary || {};
            
            if (learnedItems.length === 0) {
                console.log("Using mock data for review.");
                learnedItems = mockLearnedItems;
            }

            let words = [];
            
            // Check if we have merged vocabulary data
            if (Object.keys(mergedVocabulary).length > 0) {
                console.log("[Review] Using merged vocabulary data");
                
                // For merged vocabulary, we need to create multiple entries for words that appear on different days
                // to ensure they show up in both daily and total reviews
                const processedWords = new Map();
                
                Object.values(mergedVocabulary).forEach(mergedWord => {
                    // Group examples by date to handle words appearing on multiple days
                    const examplesByDate = new Map();
                    
                    mergedWord.examples.forEach(example => {
                        const dateKey = getLocalDateKey(example.timestamp);
                        if (!examplesByDate.has(dateKey)) {
                            examplesByDate.set(dateKey, []);
                        }
                        examplesByDate.get(dateKey).push(example);
                    });
                    
                    // Create an entry for each date this word appeared
                    examplesByDate.forEach((examplesOnDate, dateKey) => {
                        const representativeExample = examplesOnDate[0]; // Use first example as representative
                        const wordKey = `${mergedWord.word.toLowerCase()}::${dateKey}`;
                        
                        if (!processedWords.has(wordKey)) {
                            words.push({
                                word: mergedWord.word,
                                // Use firstTimestamp for chronological sorting, but keep representative timestamp for daily filtering
                                timestamp: mergedWord.firstTimestamp || representativeExample.timestamp,
                                dailyTimestamp: representativeExample.timestamp, // Used for daily filtering
                                originalText: mergedWord.examples.map(ex => ex.originalText).join(' | '),
                                definition: mergedWord.definition,
                                translation: mergedWord.definition,
                                isMerged: true,
                                mergedData: mergedWord,
                                dateKey: dateKey
                            });
                            processedWords.set(wordKey, true);
                        }
                    });
                });
                
                // Also include non-merged words (words that appear only once)
                const mergedWordKeys = new Set(Object.keys(mergedVocabulary));
                learnedItems.forEach(item => {
                    item.selectedWords.forEach(wordData => {
                        const wordKey = wordData.word.toLowerCase();
                        if (!mergedWordKeys.has(wordKey)) {
                            // This word is not merged, include it as single word
                            words.push({
                                word: wordData.word,
                                timestamp: item.timestamp,
                                originalText: item.originalText,
                                definition: wordData.definition,
                                translation: wordData.translation,
                                isMerged: false
                            });
                        }
                    });
                });
            } else {
                console.log("[Review] Using individual words (no merged data)");
                
                // Fallback to individual words if no merged data
                words = learnedItems.flatMap(item => 
                    item.selectedWords.map(word => ({ 
                        ...word, 
                        timestamp: item.timestamp, 
                        originalText: item.originalText,
                        isMerged: false
                    }))
                );
            }

            console.log(`[Review loadWords] All available words:`, words.map(w => ({
                word: w.word,
                timestamp: w.timestamp,
                key: `${w.word}::${w.timestamp}`,
                isMerged: w.isMerged || false
            })));

            // Sort words by timestamp FIRST (oldest first - chronological order)
            words.sort((a, b) => {
                // Convert timestamps to numbers for proper comparison
                const timestampA = typeof a.timestamp === 'string' ? new Date(a.timestamp).getTime() : a.timestamp;
                const timestampB = typeof b.timestamp === 'string' ? new Date(b.timestamp).getTime() : b.timestamp;
                return timestampA - timestampB;
            });

            console.log(`[Review Sort] All words after sorting by timestamp:`, words.map(w => ({
                word: w.word,
                timestamp: w.timestamp,
                timestampMs: typeof w.timestamp === 'string' ? new Date(w.timestamp).getTime() : w.timestamp,
                date: new Date(typeof w.timestamp === 'string' ? w.timestamp : w.timestamp).toLocaleString()
            })));

            // Apply filters AFTER sorting
            if (mode === 'daily') {
                const todayKey = getLocalDateKey(Date.now());
                words = words.filter(w => getLocalDateKey(w.dailyTimestamp || w.timestamp) === todayKey);
            } else if (mode === 'unit') {
                // choose unit index via query, default 1
                const unitIndex = Math.max(1, parseInt(params.get('unit') || '1', 10));
                const start = (unitIndex - 1) * 20;
                words = words.slice(start, start + 20);
                console.log(`[Review Unit] Selected unit ${unitIndex}, words ${start + 1}-${start + words.length}:`, words.map(w => ({
                    word: w.word,
                    date: new Date(typeof w.timestamp === 'string' ? w.timestamp : w.timestamp).toLocaleString()
                })));
            } else if (mode === 'star') {
                console.log(`[Review Filter] Raw starred words from storage:`, data.starredWords);
                
                // Support both old format (strings) and new format (objects)
                const starredItems = [];
                (data.starredWords || []).forEach(item => {
                    if (typeof item === 'string') {
                        // Old format: "word::timestamp"
                        const [word, timestamp] = item.split('::');
                        starredItems.push({
                            word: word,
                            timestamp: timestamp,
                            definition: null,
                            source: 'legacy'
                        });
                    } else {
                        // New format: object
                        starredItems.push(item);
                    }
                });
                
                console.log(`[Review Filter] Processed starred items:`, starredItems);

                // Create words list from starred items
                words = starredItems.map(starredItem => {
                    // Try to find the original learned word data
                    const originalWord = words.find(w => 
                        w.word === starredItem.word && 
                        w.timestamp.toString() === starredItem.timestamp.toString()
                    );
                    
                    if (originalWord) {
                        // Use original word data if found
                        return { ...originalWord, isStarred: true };
                    } else {
                        // Create synthetic word data for additional starred words
                        return {
                            word: starredItem.word,
                            definition: starredItem.definition || `Definition for ${starredItem.word}`,
                            timestamp: parseInt(starredItem.timestamp),
                            originalText: 'Added from word card',
                            isStarred: true,
                            isAdditionalStarred: true,
                            source: starredItem.source || 'unknown'
                        };
                    }
                });
                
                console.log(`[Review Filter] Final starred words for review:`, {
                    total: words.length,
                    words: words.map(w => ({ 
                        word: w.word, 
                        timestamp: w.timestamp, 
                        isAdditional: w.isAdditionalStarred,
                        source: w.source 
                    }))
                });
            }

            allWords = words;

            if (allWords.length > 0) {
                // Load saved progress
                getReviewProgress(mode, (savedIndex) => {
                    if (mode === 'unit') {
                        // For unit mode, adjust saved index to be relative to current unit
                        const unitIndex = Math.max(1, parseInt(params.get('unit') || '1', 10));
                        const unitOffset = (unitIndex - 1) * 20;
                        const relativeIndex = savedIndex - unitOffset;
                        
                        if (relativeIndex >= 0 && relativeIndex < allWords.length) {
                            currentIndex = relativeIndex;
                        } else {
                            currentIndex = 0;
                        }
                    } else {
                        if (savedIndex >= 0 && savedIndex < allWords.length) {
                            currentIndex = savedIndex;
                        } else {
                            currentIndex = 0;
                        }
                    }
                    updateReviewState();
                });
            } else {
                displayNoWordsMessage();
            }
        });
    }

    function updateReviewState() {
        totalWordsEl.textContent = allWords.length;
        currentWordEl.textContent = currentIndex + 1;
        
        // Update unit info display
        const params = new URLSearchParams(location.search);
        const mode = params.get('mode') || 'total';
        if (mode === 'unit') {
            const unitIndex = Math.max(1, parseInt(params.get('unit') || '1', 10));
            unitInfoEl.textContent = `Unit ${unitIndex}`;
            unitInfoEl.style.display = 'block';
        } else {
            unitInfoEl.style.display = 'none';
        }
        const wordData = allWords[currentIndex];
        if (wordData) {
            wordElement.textContent = wordData.word;
            definitionElement.textContent = wordData.definition;
            definitionElement.classList.add('blurred');
            
            // Initialize star button for current word
            initStar(wordData.word, wordData.timestamp);
            
            // Save current progress
            const params = new URLSearchParams(location.search);
            const mode = params.get('mode') || 'total';
            let progressIndex = currentIndex;
            
            // For unit mode, calculate absolute progress across all words
            if (mode === 'unit') {
                const unitIndex = Math.max(1, parseInt(params.get('unit') || '1', 10));
                const unitOffset = (unitIndex - 1) * 20;
                progressIndex = unitOffset + currentIndex;
            }
            
            saveReviewProgress(mode, progressIndex);
            
            if (cardDataCache.has(wordData.word)) {
                populateCard(cardDataCache.get(wordData.word), wordData.word, wordData.timestamp);
            } else {
                if (wordData.isMerged) {
                    // Handle merged word with multiple contexts
                    generateCardDetails(wordData.word, wordData.originalText, apiKey, false, wordData.timestamp, wordData.mergedData);
                } else {
                    // Handle single context word (original behavior)
                    generateCardDetails(wordData.word, wordData.originalText, apiKey, false, wordData.timestamp);
                }
            }
            preloadNextWords();
        }
    }

    function preloadNextWords() {
        for (let i = 1; i <= PRELOAD_COUNT; i++) {
            const nextIndex = (currentIndex + i) % allWords.length;
            const nextWordData = allWords[nextIndex];
            if (nextWordData && !cardDataCache.has(nextWordData.word)) {
                console.log(`Preloading data for ${nextWordData.word}`);
                if (nextWordData.isMerged) {
                    generateCardDetails(nextWordData.word, nextWordData.originalText, apiKey, true, null, nextWordData.mergedData);
                } else {
                    generateCardDetails(nextWordData.word, nextWordData.originalText, apiKey, true);
                }
            }
        }
    }

    function displayNoWordsMessage() {
        totalWordsEl.textContent = 0;
        currentWordEl.textContent = 0;
        wordCardContainer.innerHTML = '<p>No words to review yet. Go learn some!</p>';
    }

    function showNextWord() {
        if (allWords.length > 0) {
            const params = new URLSearchParams(location.search);
            const mode = params.get('mode') || 'total';
            
            // Check if we're at the last word in unit mode
            if (mode === 'unit' && currentIndex === allWords.length - 1) {
                // User completed current unit, offer to go to next unit
                showUnitCompletionDialog();
            } else {
                currentIndex = (currentIndex + 1) % allWords.length;
                updateReviewState();
            }
        }
    }

    function showPreviousWord() {
        if (allWords.length > 0) {
            currentIndex = (currentIndex - 1 + allWords.length) % allWords.length;
            updateReviewState();
        }
    }

    nextButton.addEventListener('click', showNextWord);
    backButton.addEventListener('click', showPreviousWord);

    document.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowRight') {
            showNextWord();
        } else if (event.key === 'ArrowLeft') {
            showPreviousWord();
        }
    });

    async function generateCardDetails(word, originalText, apiKey, isPreload = false, currentWordTimestamp = null, mergedData = null) {
        // Reset card state only if it's not a preload
        if (!isPreload) {
            confusableWordsList.innerHTML = '<li>Loading...</li>';
            equivalentWordsList.innerHTML = '<li>Loading...</li>';
            exampleContainer.style.display = 'none';
            mcqContainer.style.display = 'none';
        }

        if (!apiKey) {
            confusableWordsList.innerHTML = '<li>API key not found.</li>';
            equivalentWordsList.innerHTML = '<li>Please set it in options.</li>';
            return;
        }
        
        // Handle merged vocabulary with multiple contexts
        if (mergedData) {
            console.log(`[Review] Processing merged word: ${word} with ${mergedData.examples.length} contexts`);
            
            // Use combined contexts for prompt
            const combinedContext = mergedData.examples.map(ex => ex.originalText).join('\n\n');
            
            const getCardPrompt = (word, context) => {
                return `You are an expert in vocabulary and language assessment, specializing in GRE preparation. Your task is to analyze the provided English word and its context(s).

Word: "${word}"
Context: "${context}"

First, generate the following information, ensuring all definitions are in Simplified Chinese:
1.  **Confusing Words:** An array of objects for words similar in spelling or pronunciation but with different meanings. Each object must have "word" and "definition" keys. The key for this array in the JSON should be "confusable_words".
2.  **Equivalent Words:** An array of objects for words with meanings similar to the main word ("${word}"). These are crucial for GRE sentence equivalence. Each object must have "word" and "definition" keys. The key for this array in the JSON should be "equivalent_words". This list should contain synonyms for "${word}" and should NOT be influenced by the correct answers if the context is a multiple-choice question.

Next, analyze the context(s). For each context found:
- If it's a GRE-style multiple-choice question (MCQ), add it to an "mcqs" array
- If it's a regular sentence, add it to an "examples" array

**For MCQs:** Each MCQ object should contain:
- "question": The question text
- "options": Array of option objects (each with "word" and "definition" in Simplified Chinese) 
- "correct_answers": Array of correct answer words
**Important** Note that the main word ${word} is not necessary the answer to the question. There are three types of questions, single answer one blank question, double answers one blank question (the two answers must be equivalent words), two blanks question with one answer for each blank.

**For Examples:** Each example object should contain:
- "sentence": The sentence text
- "translation": Chinese translation of the sentence
- "translated_word": The specific Chinese translation of "${word}" in this context

**Important:** Return ALL found MCQs and ALL found example sentences. If there's only one MCQ, use "mcq" (singular). If there's only one example, use "example" (singular). If there are multiple, use "mcqs" and "examples" (plural arrays).

You must return the result as a single, valid JSON object with NO other text or markdown.

Example for single context:
{
  "confusable_words": [{"word": "relict", "definition": "残遗的生物或地貌"}],
  "equivalent_words": [{"word": "vestige", "definition": "痕迹"}],
  "mcq": {
    "question": "His political view is a _____ with no bearing on the present.",
    "options": [{"word": "relic", "definition": "遗迹"}, {"word": "vestige", "definition": "痕迹"}],
    "correct_answers": ["relic", "vestige"]
  }
}

Example for multiple contexts:
{
  "confusable_words": [{"word": "relict", "definition": "残遗的生物或地貌"}],
  "equivalent_words": [{"word": "vestige", "definition": "痕迹"}],
  "mcqs": [
    {
      "question": "First question _____ here.",
      "options": [{"word": "relic", "definition": "遗迹"}, {"word": "vestige", "definition": "痕迹"}, {"word": "prototype", "definition": "原型"}],
      "correct_answers": ["relic", "vestige"]
    },
    {
      "question": "Second question _____ here.",
      "options": [{"word": "relic", "definition": "遗迹"}, {"word": "historical site", "definition": "历史遗迹"}, {"word": "prospect", "definition": "前景"}],
      "correct_answers": ["relic", "historical site"]
    }
  ],
  "examples": [
    {
      "sentence": "The ancient relic was preserved.",
      "translation": "古代遗物被保存了。",
      "translated_word": "遗物"
    }
  ]
}
There might be a single mcq or example or multiples.`;
            };
            
            try {
                const prompt = getCardPrompt(word, combinedContext);
                const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-preview-06-17:generateContent?key=${apiKey}`;
        
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 25000);
        
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ "contents": [{ "parts": [{ "text": prompt }] }] }),
                    signal: controller.signal
                });
        
                clearTimeout(timeoutId);
        
                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                
                const data = await response.json();
                if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
                    throw new Error('Invalid API response structure');
                }
        
                let responseText = data.candidates[0].content.parts[0].text;
                if (responseText.includes('```json')) {
                    responseText = responseText.replace(/```json\s*/, '').replace(/```\s*$/, '');
                } else if (responseText.includes('```')) {
                    responseText = responseText.replace(/```\s*/, '').replace(/```\s*$/, '');
                }
        
                const cardData = JSON.parse(responseText.trim());
                console.log(`[Review] Generated merged card data for ${word}:`, cardData);
        
                cardDataCache.set(word, cardData);
                
                if (!isPreload) {
                    populateCard(cardData, word, currentWordTimestamp);
                }
                
                return;
                
            } catch (error) {
                console.error('Error generating merged card details:', error);
                if (!isPreload) {
                    exampleContainer.style.display = 'block';
                    exampleTextElement.innerHTML = `<p>Error loading details: ${error.message}</p>`;
                }
                return;
            }
        }

        const getCardPrompt = (word, context) => {
            return `You are an expert in vocabulary and language assessment, specializing in GRE preparation. Your task is to analyze the provided English word and its context(s).

Word: "${word}"
Context: "${context}"

First, generate the following information, ensuring all definitions are in Simplified Chinese:
1.  **Confusing Words:** An array of objects for words similar in spelling or pronunciation but with different meanings. Each object must have "word" and "definition" keys. The key for this array in the JSON should be "confusable_words".
2.  **Equivalent Words:** An array of objects for words with meanings similar to the main word ("${word}"). These are crucial for GRE sentence equivalence. Each object must have "word" and "definition" keys. The key for this array in the JSON should be "equivalent_words". This list should contain synonyms for "${word}" and should NOT be influenced by the correct answers if the context is a multiple-choice question.

Next, analyze the context(s). For each context found:
- If it's a GRE-style multiple-choice question (MCQ), add it to an "mcqs" array
- If it's a regular sentence, add it to an "examples" array

**For MCQs:** Each MCQ object should contain:
- "question": The question text
- "options": Array of option objects (each with "word" and "definition" in Simplified Chinese) 
- "correct_answers": Array of correct answer words

**For Examples:** Each example object should contain:
- "sentence": The sentence text
- "translation": Chinese translation of the sentence
- "translated_word": The specific Chinese translation of "${word}" in this context

**Important:** Return ALL found MCQs and ALL found example sentences. If there's only one MCQ, use "mcq" (singular). If there's only one example, use "example" (singular). If there are multiple, use "mcqs" and "examples" (plural arrays).

You must return the result as a single, valid JSON object with NO other text or markdown.

Example for single context:
{
  "confusable_words": [{"word": "relict", "definition": "残遗的生物或地貌"}],
  "equivalent_words": [{"word": "vestige", "definition": "痕迹"}],
  "mcq": {
    "question": "His political view is a _____ with no bearing on the present.",
    "options": [{"word": "relic", "definition": "遗迹"}, {"word": "vestige", "definition": "痕迹"}],
    "correct_answers": ["relic", "vestige"]
  }
}

Example for multiple contexts:
{
  "confusable_words": [{"word": "relict", "definition": "残遗的生物或地貌"}],
  "equivalent_words": [{"word": "vestige", "definition": "痕迹"}],
  "mcqs": [
    {
      "question": "First question _____ here.",
      "options": [{"word": "relic", "definition": "遗迹"}],
      "correct_answers": ["relic"]
    },
    {
      "question": "Second question _____ here.",
      "options": [{"word": "vestige", "definition": "痕迹"}],
      "correct_answers": ["vestige"]
    }
  ],
  "examples": [
    {
      "sentence": "The ancient relic was preserved.",
      "translation": "古代遗物被保存了。",
      "translated_word": "遗物"
    }
  ]
}
{
  "confusable_words": [
    {"word": "relict", "definition": "残遗的生物或地貌"},
    {"word": "relish", "definition": "享受"}
  ],
  "equivalent_words": [
    {"word": "vestige", "definition": "更偏向“痕迹”，可用于抽象概念"},
    {"word": "artifact", "definition": "特指人工制品"}
  ],
  "mcq": {
    "question": "His political view, harking back to the turmoil in the 1934, is a _____ with no bearing on the present.",
    "options": [
        {"word": "prototype", "definition": "原型"},
        {"word": "pretense", "definition": "借口"},
        {"word": "paradigm", "definition": "范例"},
        {"word": "relic", "definition": "遗迹"},
        {"word": "vestige", "definition": "痕迹"}
    ],
    "correct_answers": ["relic", "vestige"]
}
There might be a single mcq or example or multiples.`;
        };

        try {
            const prompt = getCardPrompt(word, originalText);
            const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-preview-06-17:generateContent?key=${apiKey}`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 25000);            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ "contents": [{ "parts": [{ "text": prompt }] }] }),
                signal: controller.signal
            });
    
            clearTimeout(timeoutId);
    
            if (!response.ok) throw new Error(`API Error: ${response.status}`);
            
            const data = await response.json();
            if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
                throw new Error('Invalid API response structure');
            }
    
            let responseText = data.candidates[0].content.parts[0].text;
            if (responseText.includes('```json')) {
                responseText = responseText.replace(/```json\s*/, '').replace(/```\s*$/, '');
            } else if (responseText.includes('```')) {
                responseText = responseText.replace(/```\s*/, '').replace(/```\s*$/, '');
            }
    
            const cardData = JSON.parse(responseText.trim());
            cardDataCache.set(word, cardData);

            if (!isPreload) {
                populateCard(cardData, word, currentWordTimestamp);
            }
    
        } catch (error) {
            console.error('Error generating word card details:', error);
            if (!isPreload) {
                exampleContainer.style.display = 'block';
                exampleTextElement.innerHTML = `<p>Error loading details: ${error.message}</p>`;
            }
        }
    }

    function populateCard(cardData, word, currentWordTimestamp) {
        populateList(confusableWordsList, cardData.confusable_words, currentWordTimestamp);
        populateList(equivalentWordsList, cardData.equivalent_words, currentWordTimestamp);

        // Reset containers properly - don't clear innerHTML as it removes the HTML structure
        exampleContainer.style.display = 'none';
        mcqContainer.style.display = 'none';
        
        // Clear only the content elements
        if (exampleTextElement) {
            exampleTextElement.innerHTML = '';
        }
        if (mcqQuestionElement) {
            mcqQuestionElement.innerHTML = '';
        }
        if (mcqOptionsListElement) {
            mcqOptionsListElement.innerHTML = '';
        }
        
        // Remove any additional sections that were appended
        const additionalMcqSections = mcqContainer.querySelectorAll('.mcq-section');
        additionalMcqSections.forEach(section => section.remove());
        
        const additionalExampleSections = exampleContainer.querySelectorAll('.example-section');
        additionalExampleSections.forEach(section => section.remove());

        // Normalize data - convert single items to arrays for unified processing
        const mcqs = cardData.mcqs || (cardData.mcq ? [cardData.mcq] : []);
        const examples = cardData.examples || (cardData.example ? [cardData.example] : []);
        
        let hasDisplayedContent = false;
        
        // Handle all MCQs uniformly
        mcqs.forEach((mcq, index) => {
            if (index === 0) {
                displayMCQ(mcq, word, currentWordTimestamp);
            } else {
                appendMCQ(mcq, word, index, currentWordTimestamp);
            }
        });
        if (mcqs.length > 0) hasDisplayedContent = true;
        
        // Handle all examples uniformly  
        examples.forEach((example, index) => {
            if (index === 0 && !hasDisplayedContent) {
                displayExample(example, word);
            } else {
                appendExample(example, word, index);
            }
        });
    }
    
    function populateList(listElement, items, currentWordTimestamp) {
        listElement.innerHTML = '';
        if (items && items.length > 0) {
            items.forEach(item => {
                const li = document.createElement('li');
                li.textContent = item.word;
                li.dataset.word = item.word;
                li.dataset.definition = item.definition;
                li.dataset.state = 'initial'; // States: initial, definition-shown, starred

                li.addEventListener('click', () => {
                    if (li.dataset.state === 'initial') {
                        // First click: show definition
                        li.textContent = `${item.word} (${item.definition})`;
                        li.dataset.state = 'definition-shown';
                    } else if (li.dataset.state === 'definition-shown') {
                        // Second click: star the word and highlight (without bold)
                        li.classList.add('starred');
                        li.dataset.state = 'starred';
                        
                        // Generate example sentence for the word
                        const wordToStar = item.word;
                        generateExampleSentence(wordToStar, item.definition).then(exampleData => {
                            const currentTimestamp = Date.now();
                            
                            const newVocabularyItem = {
                                originalText: exampleData.sentence,
                                translation: exampleData.translation,
                                selectedWords: [{
                                    word: wordToStar,
                                    translation: item.definition,
                                    definition: item.definition
                                }],
                                timestamp: currentTimestamp
                            };
                            
                            console.log(`[Review] Adding to vocabulary with example:`, newVocabularyItem);
                            
                            // Add to learnedItems first
                            chrome.storage.local.get({ learnedItems: [] }, ({ learnedItems }) => {
                                const updatedLearnedItems = [...(learnedItems || []), newVocabularyItem];
                                
                                chrome.storage.local.set({ learnedItems: updatedLearnedItems }, () => {
                                    console.log(`[Review] Added to vocabulary successfully`);
                                    
                                    // Then add to starred words using the new timestamp
                                    chrome.storage.local.get({ starredWords: [] }, ({ starredWords }) => {
                                        // Support both old format (strings) and new format (objects)
                                        const starredSet = new Set();
                                        const starredObjects = [];
                                        
                                        (starredWords || []).forEach(item => {
                                            if (typeof item === 'string') {
                                                // Old format: "word::timestamp"
                                                starredSet.add(item);
                                                const [word, timestamp] = item.split('::');
                                                starredObjects.push({
                                                    word: word,
                                                    timestamp: timestamp,
                                                    definition: null,
                                                    source: 'legacy'
                                                });
                                            } else {
                                                // New format: object
                                                const key = `${item.word}::${item.timestamp}`;
                                                starredSet.add(key);
                                                starredObjects.push(item);
                                            }
                                        });
                                        
                                        const key = `${wordToStar}::${currentTimestamp}`;
                                        
                                        console.log(`[Review] Adding to starred words with example:`, {
                                            word: wordToStar,
                                            timestamp: currentTimestamp,
                                            definition: item.definition,
                                            key: key,
                                            existingStarredWords: starredWords
                                        });
                                        
                                        if (!starredSet.has(key)) {
                                            const newStarredItem = {
                                                word: wordToStar,
                                                timestamp: currentTimestamp,
                                                definition: item.definition,
                                                source: 'review-list'
                                            };
                                            starredObjects.push(newStarredItem);
                                            
                                            chrome.storage.local.set({ starredWords: starredObjects }, () => {
                                                console.log(`[Review] Updated starred words with example:`, starredObjects);
                                            });
                                        }
                                    });
                                });
                            });
                        }).catch(error => {
                            console.error('Error generating example sentence for review word:', error);
                            // Fallback to original behavior if API fails
                            const originalTimestamp = currentWordTimestamp; // Use current word's timestamp
                            
                            chrome.storage.local.get({ starredWords: [] }, ({ starredWords }) => {
                                // Support both old format (strings) and new format (objects)
                                const starredSet = new Set();
                                const starredObjects = [];
                                
                                (starredWords || []).forEach(item => {
                                    if (typeof item === 'string') {
                                        // Old format: "word::timestamp"
                                        starredSet.add(item);
                                        const [word, timestamp] = item.split('::');
                                        starredObjects.push({
                                            word: word,
                                            timestamp: timestamp,
                                            definition: null,
                                            source: 'legacy'
                                        });
                                    } else {
                                        // New format: object
                                        const key = `${item.word}::${item.timestamp}`;
                                        starredSet.add(key);
                                        starredObjects.push(item);
                                    }
                                });
                                
                                const key = `${wordToStar}::${originalTimestamp}`;
                                
                                console.log(`[Review List] Adding starred word (fallback):`, {
                                    word: wordToStar,
                                    timestamp: originalTimestamp,
                                    definition: item.definition,
                                    key: key,
                                    existingStarredWords: starredWords
                                });
                                
                                if (!starredSet.has(key)) {
                                    const newStarredItem = {
                                        word: wordToStar,
                                        timestamp: originalTimestamp,
                                        definition: item.definition,
                                        source: 'review-list'
                                    };
                                    starredObjects.push(newStarredItem);
                                    
                                    chrome.storage.local.set({ starredWords: starredObjects }, () => {
                                        console.log(`[Review List] Updated starred words (fallback):`, starredObjects);
                                    });
                                }
                            });
                        });
                    }
                });

                listElement.appendChild(li);
            });
        } else {
            listElement.innerHTML = '<li>None found</li>';
        }
    }
    
    function displayExample(exampleData, word) {
        // Don't hide MCQ container - allow both to display
        exampleContainer.style.display = 'block';
        
        const regex = new RegExp(`\\b(${word})\\b`, 'gi');
        const highlightedSentence = exampleData.sentence.replace(regex, '<strong>$1</strong>');
        
        const highlightedTranslation = exampleData.translation.replace(exampleData.translated_word, `<strong>${exampleData.translated_word}</strong>`);
    
        exampleTextElement.innerHTML = `${highlightedSentence}<br><br>${highlightedTranslation}`;
    }
    
    function displayMCQ(mcq, word, currentWordTimestamp) {
        mcqContainer.style.display = 'block';
        // Don't hide example container - allow both to display
        
        const regex = new RegExp(`\\b(${word})\\b`, 'gi');
        const highlightedQuestion = mcq.question.replace(regex, '<strong>$1</strong>');
        mcqQuestionElement.innerHTML = highlightedQuestion;
        
        mcqOptionsListElement.innerHTML = '';
    
        const correctAnswers = mcq.correct_answers || [mcq.correct_answer];
    
        mcq.options.forEach(option => {
            const li = document.createElement('li');
            li.textContent = option.word;
            li.dataset.word = option.word; 
            li.dataset.definition = option.definition;
            li.dataset.state = 'unanswered'; // States: unanswered, revealed, definition-shown, starred
    
            li.addEventListener('click', () => {
                if (li.dataset.state === 'unanswered') {
                    if (correctAnswers.includes(li.dataset.word)) {
                        li.classList.add('correct');
                    } else {
                        li.classList.add('incorrect');
                    }
                    li.dataset.state = 'revealed';
                } else if (li.dataset.state === 'revealed') {
                    if (option.definition && !li.textContent.includes(option.definition)) {
                        li.textContent = `${option.word} (${option.definition})`;
                        li.dataset.state = 'definition-shown';
                    }
                } else if (li.dataset.state === 'definition-shown') {
                    // Third click: star the word and highlight (without bold)
                    li.classList.add('starred');
                    li.dataset.state = 'starred';
                    
                    // Generate example sentence for the MCQ option word
                    const wordToStar = option.word;
                    generateExampleSentence(wordToStar, option.definition).then(exampleData => {
                        const currentTimestamp = Date.now();
                        
                        const newVocabularyItem = {
                            originalText: exampleData.sentence,
                            translation: exampleData.translation,
                            selectedWords: [{
                                word: wordToStar,
                                translation: option.definition,
                                definition: option.definition
                            }],
                            timestamp: currentTimestamp
                        };
                        
                        console.log(`[Review MCQ] Adding to vocabulary with example:`, newVocabularyItem);
                        
                        // Add to learnedItems first
                        chrome.storage.local.get({ learnedItems: [] }, ({ learnedItems }) => {
                            const updatedLearnedItems = [...(learnedItems || []), newVocabularyItem];
                            
                            chrome.storage.local.set({ learnedItems: updatedLearnedItems }, () => {
                                console.log(`[Review MCQ] Added to vocabulary with example successfully`);
                                
                                // Then add to starred words using the new timestamp
                                chrome.storage.local.get({ starredWords: [] }, ({ starredWords }) => {
                                    // Support both old format (strings) and new format (objects)
                                    const starredSet = new Set();
                                    const starredObjects = [];
                                    
                                    (starredWords || []).forEach(item => {
                                        if (typeof item === 'string') {
                                            // Old format: "word::timestamp"
                                            starredSet.add(item);
                                            const [word, timestamp] = item.split('::');
                                            starredObjects.push({
                                                word: word,
                                                timestamp: timestamp,
                                                definition: null,
                                                source: 'legacy'
                                            });
                                        } else {
                                            // New format: object
                                            const key = `${item.word}::${item.timestamp}`;
                                            starredSet.add(key);
                                            starredObjects.push(item);
                                        }
                                    });
                                    
                                    const key = `${wordToStar}::${currentTimestamp}`;
                                    
                                    console.log(`[Review MCQ] Adding to starred words with example:`, {
                                        word: wordToStar,
                                        timestamp: currentTimestamp,
                                        definition: option.definition,
                                        key: key,
                                        existingStarredWords: starredWords
                                    });
                                    
                                    if (!starredSet.has(key)) {
                                        const newStarredItem = {
                                            word: wordToStar,
                                            timestamp: currentTimestamp,
                                            definition: option.definition,
                                            source: 'review-mcq'
                                        };
                                        starredObjects.push(newStarredItem);
                                        
                                        chrome.storage.local.set({ starredWords: starredObjects }, () => {
                                            console.log(`[Review MCQ] Updated starred words with example:`, starredObjects);
                                        });
                                    }
                                });
                            });
                        });
                    }).catch(error => {
                        console.error('Error generating example sentence for MCQ word:', error);
                        // Fallback to original behavior if API fails
                        const originalTimestamp = currentWordTimestamp; // Use current word's timestamp
                        
                        chrome.storage.local.get({ starredWords: [] }, ({ starredWords }) => {
                            // Support both old format (strings) and new format (objects)
                            const starredSet = new Set();
                            const starredObjects = [];
                            
                            (starredWords || []).forEach(item => {
                                if (typeof item === 'string') {
                                    // Old format: "word::timestamp"
                                    starredSet.add(item);
                                    const [word, timestamp] = item.split('::');
                                    starredObjects.push({
                                        word: word,
                                        timestamp: timestamp,
                                        definition: null,
                                        source: 'legacy'
                                    });
                                } else {
                                    // New format: object
                                    const key = `${item.word}::${item.timestamp}`;
                                    starredSet.add(key);
                                    starredObjects.push(item);
                                }
                            });
                            
                            const key = `${wordToStar}::${originalTimestamp}`;
                            
                            console.log(`[Review MCQ] Adding starred word (fallback):`, {
                                word: wordToStar,
                                timestamp: originalTimestamp,
                                definition: option.definition,
                                key: key,
                                existingStarredWords: starredWords
                            });
                            
                            if (!starredSet.has(key)) {
                                const newStarredItem = {
                                    word: wordToStar,
                                    timestamp: originalTimestamp,
                                    definition: option.definition,
                                    source: 'review-mcq'
                                };
                                starredObjects.push(newStarredItem);
                                
                                chrome.storage.local.set({ starredWords: starredObjects }, () => {
                                    console.log(`[Review MCQ] Updated starred words (fallback):`, starredObjects);
                                });
                            }
                        });
                    });
                }
            });
            mcqOptionsListElement.appendChild(li);
        });
    }

    // Initial load
    loadWords();

    async function generateExampleSentence(word, definition) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(['geminiApiKey'], (data) => {
                const apiKey = data.geminiApiKey;
                if (!apiKey) {
                    reject(new Error('No API key found'));
                    return;
                }
                
                const prompt = `Generate a clear and simple example sentence for the English word "${word}" which means "${definition}". The sentence should be at GRE level but understandable, highlighting the word's meaning in context.

Return the result as a JSON object with exactly two keys:
- "sentence": The English example sentence with the word "${word}" used appropriately
- "translation": The Chinese translation of the entire sentence

Example format:
{
  "sentence": "The ancient relic was carefully preserved in the museum.",
  "translation": "这件古代遗物被小心地保存在博物馆里。"
}

Do not include any other text, markdown, or explanations. Return only the JSON object.`;

                const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-preview-06-17:generateContent?key=${apiKey}`;

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);

                fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ "contents": [{ "parts": [{ "text": prompt }] }] }),
                    signal: controller.signal
                })
                .then(response => {
                    clearTimeout(timeoutId);
                    if (!response.ok) throw new Error(`API Error: ${response.status}`);
                    return response.json();
                })
                .then(data => {
                    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
                        throw new Error('Invalid API response structure');
                    }

                    let responseText = data.candidates[0].content.parts[0].text;
                    if (responseText.includes('```json')) {
                        responseText = responseText.replace(/```json\s*/, '').replace(/```\s*$/, '');
                    } else if (responseText.includes('```')) {
                        responseText = responseText.replace(/```\s*/, '').replace(/```\s*$/, '');
                    }

                    const exampleData = JSON.parse(responseText.trim());
                    console.log(`[Review] Generated example for "${word}":`, exampleData);
                    resolve(exampleData);
                })
                .catch(error => {
                    clearTimeout(timeoutId);
                    console.error('Error generating example sentence:', error);
                    reject(error);
                });
            });
        });
    }

    /**
     * Append additional MCQ to existing MCQ container
     * @param {Object} mcq - MCQ data
     * @param {string} word - The target word
     * @param {number} index - MCQ index for unique IDs
     * @param {string} currentWordTimestamp - Current word timestamp for starring
     */
    function appendMCQ(mcq, word, index, currentWordTimestamp) {
        const mcqContainer = document.getElementById('mcq-container');
        
        // Create additional MCQ section
        const mcqSection = document.createElement('div');
        mcqSection.className = 'mcq-section';
        mcqSection.innerHTML = `
            <hr style="margin: 20px 0; border: 1px solid #e1e5e9;">
            <div class="mcq-question" id="mcq-question-${index}"></div>
            <ul class="mcq-options-list" id="mcq-options-list-${index}"></ul>
        `;
        
        mcqContainer.appendChild(mcqSection);
        
        const questionElement = document.getElementById(`mcq-question-${index}`);
        const optionsListElement = document.getElementById(`mcq-options-list-${index}`);

        // Highlight the word if it appears in the question text
        const regex = new RegExp(`\\b(${word})\\b`, 'gi');
        const highlightedQuestion = mcq.question.replace(regex, '<strong>$1</strong>');
        questionElement.innerHTML = highlightedQuestion;
        
        optionsListElement.innerHTML = '';

        const correctAnswers = mcq.correct_answers || [mcq.correct_answer];

        mcq.options.forEach(option => {
            const li = document.createElement('li');
            li.textContent = option.word;
            li.dataset.word = option.word; 
            li.dataset.definition = option.definition;
            li.dataset.state = 'unanswered';

            li.addEventListener('click', () => {
                if (li.dataset.state === 'unanswered') {
                    if (correctAnswers.includes(li.dataset.word)) {
                        li.classList.add('correct');
                    } else {
                        li.classList.add('incorrect');
                    }
                    li.dataset.state = 'revealed';
                } else if (li.dataset.state === 'revealed') {
                    if (option.definition && !li.textContent.includes(option.definition)) {
                        li.textContent = `${option.word} (${option.definition})`;
                        li.dataset.state = 'definition-shown';
                    }
                } else if (li.dataset.state === 'definition-shown') {
                    // Third click: star the word and highlight (without bold)
                    li.classList.add('starred');
                    li.dataset.state = 'starred';
                    
                    // Generate example sentence for the MCQ option word
                    const wordToStar = option.word;
                    generateExampleSentence(wordToStar, option.definition).then(exampleData => {
                        const currentTimestamp = Date.now();
                        
                        const newVocabularyItem = {
                            originalText: exampleData.sentence,
                            translation: exampleData.translation,
                            selectedWords: [{
                                word: wordToStar,
                                translation: option.definition,
                                definition: option.definition
                            }],
                            timestamp: currentTimestamp
                        };
                        
                        console.log(`[Review MCQ] Adding to vocabulary with example:`, newVocabularyItem);
                        
                        // Add to learnedItems first
                        chrome.storage.local.get({ learnedItems: [] }, ({ learnedItems }) => {
                            const updatedLearnedItems = [...(learnedItems || []), newVocabularyItem];
                            
                            chrome.storage.local.set({ learnedItems: updatedLearnedItems }, () => {
                                console.log(`[Review MCQ] Added to vocabulary with example successfully`);
                                
                                // Then add to starred words using the new timestamp
                                chrome.storage.local.get({ starredWords: [] }, ({ starredWords }) => {
                                    // Support both old format (strings) and new format (objects)
                                    const starredSet = new Set();
                                    const starredObjects = [];
                                    
                                    (starredWords || []).forEach(item => {
                                        if (typeof item === 'string') {
                                            // Old format: "word::timestamp"
                                            starredSet.add(item);
                                            const [word, timestamp] = item.split('::');
                                            starredObjects.push({
                                                word: word,
                                                timestamp: timestamp,
                                                definition: null,
                                                source: 'legacy'
                                            });
                                        } else {
                                            // New format: object
                                            const key = `${item.word}::${item.timestamp}`;
                                            starredSet.add(key);
                                            starredObjects.push(item);
                                        }
                                    });
                                    
                                    // Check if this word (with current timestamp) is already starred
                                    const newKey = `${wordToStar}::${currentTimestamp}`;
                                    if (!starredSet.has(newKey)) {
                                        // Add new starred word object
                                        starredObjects.push({
                                            word: wordToStar,
                                            timestamp: currentTimestamp,
                                            definition: option.definition,
                                            source: 'review-mcq',
                                            originalContext: `MCQ ${index + 1} option for: ${word}`
                                        });
                                        
                                        console.log(`[Review MCQ] Starring word:`, wordToStar);
                                        
                                        chrome.storage.local.set({ starredWords: starredObjects }, () => {
                                            console.log(`[Review MCQ] Word starred successfully`);
                                        });
                                    }
                                });
                            });
                        });
                    }).catch(error => {
                        console.error('Error generating example sentence:', error);
                        // Fallback to original behavior if API fails
                        const currentTimestamp = Date.now();
                        const newVocabularyItem = {
                            originalText: `MCQ ${index + 1} option for: ${word}`,
                            translation: `Added from review page: ${wordToStar} (${option.definition})`,
                            selectedWords: [{
                                word: wordToStar,
                                translation: option.definition,
                                definition: option.definition
                            }],
                            timestamp: currentTimestamp
                        };
                        
                        // Continue with fallback logic (same as before)
                        chrome.storage.local.get({ learnedItems: [] }, ({ learnedItems }) => {
                            const updatedLearnedItems = [...(learnedItems || []), newVocabularyItem];
                            chrome.storage.local.set({ learnedItems: updatedLearnedItems }, () => {
                                chrome.storage.local.get({ starredWords: [] }, ({ starredWords }) => {
                                    const starredSet = new Set();
                                    const starredObjects = [];
                                    
                                    (starredWords || []).forEach(item => {
                                        if (typeof item === 'string') {
                                            starredSet.add(item);
                                            const [word, timestamp] = item.split('::');
                                            starredObjects.push({
                                                word: word,
                                                timestamp: timestamp,
                                                definition: null,
                                                source: 'legacy'
                                            });
                                        } else {
                                            const key = `${item.word}::${item.timestamp}`;
                                            starredSet.add(key);
                                            starredObjects.push(item);
                                        }
                                    });
                                    
                                    const newKey = `${wordToStar}::${currentTimestamp}`;
                                    if (!starredSet.has(newKey)) {
                                        starredObjects.push({
                                            word: wordToStar,
                                            timestamp: currentTimestamp,
                                            definition: option.definition,
                                            source: 'review-mcq-fallback',
                                            originalContext: `MCQ ${index + 1} option for: ${word}`
                                        });
                                        
                                        chrome.storage.local.set({ starredWords: starredObjects });
                                    }
                                });
                            });
                        });
                    });
                }
            });
            optionsListElement.appendChild(li);
        });
    }

    /**
     * Append additional example to existing example container
     * @param {Object} example - Example data
     * @param {string} word - The target word
     * @param {number} index - Example index
     */
    function appendExample(example, word, index) {
        const exampleContainer = document.getElementById('example-container');
        
        // Create additional example section
        const exampleSection = document.createElement('div');
        exampleSection.className = 'example-section';
        exampleSection.innerHTML = `
            <hr style="margin: 20px 0; border: 1px solid #e1e5e9;">
            <div class="example-text" id="example-text-${index}"></div>
        `;
        
        exampleContainer.appendChild(exampleSection);
        
        const exampleTextElement = document.getElementById(`example-text-${index}`);
        
        // Highlight English word
        const regex = new RegExp(`\\b(${word})\\b`, 'gi');
        const highlightedSentence = example.sentence.replace(regex, '<strong>$1</strong>');
        
        // Highlight Chinese translation of the word
        const highlightedTranslation = example.translation.replace(example.translated_word, `<strong>${example.translated_word}</strong>`);

        exampleTextElement.innerHTML = `${highlightedSentence}<br><br>${highlightedTranslation}`;
    }

    /**
     * Helper function to add word to vocabulary and starred words
     * @param {string} wordToStar - Word to add
     * @param {string} definition - Word definition
     * @param {string} originalText - Context text
     * @param {string} source - Source identifier
     * @param {string} currentWordTimestamp - Current word timestamp for reference
     */
    function addWordToVocabulary(wordToStar, definition, originalText, source, currentWordTimestamp) {
        const currentTimestamp = Date.now();
        
        const newVocabularyItem = {
            originalText: originalText,
            translation: `Added from review: ${wordToStar} (${definition})`,
            selectedWords: [{
                word: wordToStar,
                translation: definition,
                definition: definition
            }],
            timestamp: currentTimestamp
        };
        
        console.log(`[Review] Adding to vocabulary:`, newVocabularyItem);
        
        // Add to learnedItems first
        chrome.storage.local.get({ learnedItems: [] }, ({ learnedItems }) => {
            const updatedLearnedItems = [...(learnedItems || []), newVocabularyItem];
            
            chrome.storage.local.set({ learnedItems: updatedLearnedItems }, () => {
                console.log(`[Review] Added to vocabulary successfully`);
                
                // Then add to starred words using the new timestamp
                chrome.storage.local.get({ starredWords: [] }, ({ starredWords }) => {
                    // Support both old format (strings) and new format (objects)
                    const starredSet = new Set();
                    const starredObjects = [];
                    
                    (starredWords || []).forEach(item => {
                        if (typeof item === 'string') {
                            starredSet.add(item);
                            const [word, timestamp] = item.split('::');
                            starredObjects.push({
                                word: word,
                                timestamp: timestamp,
                                definition: null,
                                source: 'legacy'
                            });
                        } else {
                            const key = `${item.word}::${item.timestamp}`;
                            starredSet.add(key);
                            starredObjects.push(item);
                        }
                    });
                    
                    const key = `${wordToStar}::${currentTimestamp}`;
                    
                    if (!starredSet.has(key)) {
                        const newStarredItem = {
                            word: wordToStar,
                            timestamp: currentTimestamp,
                            definition: definition,
                            source: source
                        };
                        starredObjects.push(newStarredItem);
                        
                        chrome.storage.local.set({ starredWords: starredObjects }, () => {
                            console.log(`[Review] Updated starred words:`, starredObjects);
                        });
                    }
                });
            });
        });
    }
});
