document.addEventListener('DOMContentLoaded', () => {
    const wordElement = document.getElementById('word');
    const definitionElement = document.getElementById('definition');
    const confusableWordsList = document.getElementById('confusable-words-list');
    const equivalentWordsList = document.getElementById('equivalent-words-list');
    const starBtn = document.getElementById('star-btn');
    
    // Containers
    const exampleContainer = document.getElementById('example-container');
    const mcqContainer = document.getElementById('mcq-container');

    // Example elements
    const exampleTextElement = document.getElementById('example-text');

    // MCQ elements
    const mcqQuestionElement = document.getElementById('mcq-question');
    const mcqOptionsListElement = document.getElementById('mcq-options-list');

    const urlParams = new URLSearchParams(window.location.search);
    const word = urlParams.get('word');
    const timestamp = urlParams.get('timestamp');
    const isMerged = urlParams.get('merged') === 'true';

    function refreshStarUI(isStarred) {
        starBtn.setAttribute('aria-pressed', String(isStarred));
        starBtn.title = isStarred ? 'Unstar' : 'Star';
    }

    function getStarKey(w, t) { return `${w}::${t}`; }

    function initStar(word, timestamp) {
        chrome.storage.local.get({ starredWords: [] }, ({ starredWords }) => {
            const set = new Set(starredWords || []);
            const key = getStarKey(word, timestamp);
            refreshStarUI(set.has(key));
            starBtn.addEventListener('click', () => {
                const has = set.has(key);
                if (has) set.delete(key); else set.add(key);
                const arr = Array.from(set);
                chrome.storage.local.set({ starredWords: arr }, () => refreshStarUI(!has));
            });
        });
    }

    // Auto-resize: report height to parent
    (function setupAutoHeight() {
        let rafId = null;
        const report = () => {
            const h = Math.max(
                document.documentElement.scrollHeight,
                document.body.scrollHeight
            );
            try { window.parent?.postMessage({ type: 'wordCard:height', height: h }, '*'); } catch {}
        };
        const schedule = () => { if (rafId) cancelAnimationFrame(rafId); rafId = requestAnimationFrame(report); };
        // Initial
        schedule();
        // On resize
        window.addEventListener('resize', schedule);
        // Observe DOM changes
        const mo = new MutationObserver(schedule);
        mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
        // Also observe fonts/layout settle
        window.addEventListener('load', schedule);
    })();

    if (word && timestamp) {
        chrome.storage.local.get(['geminiApiKey', 'learnedItems', 'mergedVocabulary'], (data) => {
            const apiKey = data.geminiApiKey;
            const learnedItems = data.learnedItems || [];
            const mergedVocabulary = data.mergedVocabulary || {};
            
            if (isMerged && mergedVocabulary[word.toLowerCase()]) {
                // Handle merged word with multiple examples
                const mergedWordData = mergedVocabulary[word.toLowerCase()];
                wordElement.textContent = mergedWordData.word;
                definitionElement.textContent = mergedWordData.definition;
                
                initStar(word, timestamp);
                generateMergedCardDetails(mergedWordData, apiKey).finally(() => {
                    // height may change after async render
                    try { window.parent?.postMessage({ type: 'wordCard:height', height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) }, '*'); } catch {}
                });
            } else {
                // Handle single context word (original behavior)
                const learnedItem = learnedItems.find(item => String(item.timestamp) === timestamp);

                if (apiKey && learnedItem) {
                    const wordData = learnedItem.selectedWords.find(w => w.word === word);
                    if (wordData) {
                        wordElement.textContent = wordData.word;
                        definitionElement.textContent = wordData.definition;
                    } else {
                        // Fallback if word not in specific learned item, though this shouldn't happen.
                        wordElement.textContent = word;
                        definitionElement.textContent = "Definition not found in this context."
                    }
                    initStar(word, timestamp);
                    generateCardDetails(word, learnedItem.originalText, apiKey).finally(() => {
                        // height may change after async render
                        try { window.parent?.postMessage({ type: 'wordCard:height', height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) }, '*'); } catch {}
                    });
                } else {
                    wordElement.textContent = 'Error';
                    definitionElement.textContent = 'Could not find API key or learned item.';
                }
            }
        });
    }
});

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
  "translation": "这件古代遗物被小心地保存在博物馆里�?
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
                console.log(`[WordCard] Generated example for "${word}":`, exampleData);
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

async function generateCardDetails(word, originalText, apiKey) {
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
  "confusable_words": [
    {"word": "relict", "definition": "残遗的生物或地貌"},
    {"word": "relish", "definition": "享受"}
  ],
  "equivalent_words": [
    {"word": "vestige", "definition": "更偏向“痕迹”，可用于抽象概念"},
    {"word": "artifact", "definition": "特指人工制品"}
  ],
  "mcq": {
    "question": "His political view is a _____ with no bearing on the present.",
    "options": [{"word": "relic", "definition": "遗迹"}, {"word": "vestige", "definition": "痕迹"}, {"word": "prototype", "definition": "原型"}],
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
        const prompt = getCardPrompt(word, originalText);
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

        // Populate Confusable and Equivalent Words
        populateList(document.getElementById('confusable-words-list'), cardData.confusable_words);
        populateList(document.getElementById('equivalent-words-list'), cardData.equivalent_words);

        // Normalize data - convert single items to arrays for unified processing
        const mcqs = cardData.mcqs || (cardData.mcq ? [cardData.mcq] : []);
        const examples = cardData.examples || (cardData.example ? [cardData.example] : []);
        
        let hasDisplayedContent = false;
        
        // Handle all MCQs uniformly
        mcqs.forEach((mcq, index) => {
            if (index === 0) {
                displayMCQ(mcq, word);
            } else {
                appendMCQ(mcq, word, index);
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

    } catch (error) {
        console.error('Error generating word card details:', error);
        document.getElementById('example-container').innerHTML = `<p>Error loading details: ${error.message}</p>`;
    }
}

function populateList(listElement, items) {
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
                    // Second click: star the word and highlight
                    li.classList.add('starred');
                    li.dataset.state = 'starred';
                    
                    // First, generate example sentence for the word
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
                        
                        console.log(`[WordCard] Adding to vocabulary with example:`, newVocabularyItem);
                        
                        // Add to learnedItems first
                        chrome.storage.local.get({ learnedItems: [] }, ({ learnedItems }) => {
                            const updatedLearnedItems = [...(learnedItems || []), newVocabularyItem];
                            
                            chrome.storage.local.set({ learnedItems: updatedLearnedItems }, () => {
                                console.log(`[WordCard] Added to vocabulary successfully`);
                                
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
                                    
                                    console.log(`[WordCard] Adding to starred words:`, {
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
                                            source: 'wordcard'
                                        };
                                        starredObjects.push(newStarredItem);
                                        
                                        chrome.storage.local.set({ starredWords: starredObjects }, () => {
                                            console.log(`[WordCard] Updated starred words:`, starredObjects);
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
                            originalText: `Equivalent/Confusable word for: ${word}`,
                            translation: `Added from word card: ${wordToStar} (${item.definition})`,
                            selectedWords: [{
                                word: wordToStar,
                                translation: item.definition,
                                definition: item.definition
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
                                    
                                    const key = `${wordToStar}::${currentTimestamp}`;
                                    if (!starredSet.has(key)) {
                                        starredObjects.push({
                                            word: wordToStar,
                                            timestamp: currentTimestamp,
                                            definition: item.definition,
                                            source: 'wordcard'
                                        });
                                        chrome.storage.local.set({ starredWords: starredObjects });
                                    }
                                });
                            });
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
    document.getElementById('example-container').style.display = 'block';
    document.getElementById('mcq-container').style.display = 'none';
    const exampleTextElement = document.getElementById('example-text');
    
    // Highlight English word
    const regex = new RegExp(`\\b(${word})\\b`, 'gi');
    const highlightedSentence = exampleData.sentence.replace(regex, '<strong>$1</strong>');
    
    // Highlight Chinese translation of the word
    const highlightedTranslation = exampleData.translation.replace(exampleData.translated_word, `<strong>${exampleData.translated_word}</strong>`);

    exampleTextElement.innerHTML = `${highlightedSentence}<br><br>${highlightedTranslation}`;
}

function displayMCQ(mcq, word) {
    document.getElementById('example-container').style.display = 'none';
    document.getElementById('mcq-container').style.display = 'block';
    
    const questionElement = document.getElementById('mcq-question');
    const optionsListElement = document.getElementById('mcq-options-list');

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
                // On second click, show definition
                if (option.definition) {
                    // Prevent adding definition multiple times
                    if (!li.textContent.includes(option.definition)) {
                        li.textContent = `${option.word} (${option.definition})`;
                        li.dataset.state = 'definition-shown';
                    }
                }
            } else if (li.dataset.state === 'definition-shown') {
                // Third click: star the word and highlight
                li.classList.add('starred');
                li.dataset.state = 'starred';
                
                // First, add to vocabulary (learnedItems) like content.js
                const wordToStar = option.word;
                const currentTimestamp = Date.now();
                
                const newVocabularyItem = {
                    originalText: `MCQ option for: ${word}`,
                    translation: `Added from word card: ${wordToStar} (${option.definition})`,
                    selectedWords: [{
                        word: wordToStar,
                        translation: option.definition,
                        definition: option.definition
                    }],
                    timestamp: currentTimestamp
                };
                
                console.log(`[WordCard MCQ] Adding to vocabulary:`, newVocabularyItem);
                
                // Add to learnedItems first
                chrome.storage.local.get({ learnedItems: [] }, ({ learnedItems }) => {
                    const updatedLearnedItems = [...(learnedItems || []), newVocabularyItem];
                    
                    chrome.storage.local.set({ learnedItems: updatedLearnedItems }, () => {
                        console.log(`[WordCard MCQ] Added to vocabulary successfully`);
                        
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
                            
                            console.log(`[WordCard MCQ] Adding to starred words:`, {
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
                                    source: 'wordcard-mcq'
                                };
                                starredObjects.push(newStarredItem);
                                
                                chrome.storage.local.set({ starredWords: starredObjects }, () => {
                                    console.log(`[WordCard MCQ] Updated starred words:`, starredObjects);
                                });
                            }
                        });
                    });
                });
            }
        });
        optionsListElement.appendChild(li);
    });
}

/**
 * Append additional MCQ to existing MCQ container
 * @param {Object} mcq - MCQ data
 * @param {string} word - The target word
 * @param {number} index - MCQ index for unique IDs
 */
function appendMCQ(mcq, word, index) {
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
                // On second click, show definition
                if (option.definition && !li.textContent.includes(option.definition)) {
                    li.textContent = `${option.word} (${option.definition})`;
                    li.dataset.state = 'definition-shown';
                }
            } else if (li.dataset.state === 'definition-shown') {
                // Third click: star the word and highlight
                li.classList.add('starred');
                li.dataset.state = 'starred';
                
                // First, add to vocabulary (learnedItems) like content.js
                const wordToStar = option.word;
                const currentTimestamp = Date.now();
                
                const newVocabularyItem = {
                    originalText: `MCQ ${index + 1} option for: ${word}`,
                    translation: `Added from word card: ${wordToStar} (${option.definition})`,
                    selectedWords: [{
                        word: wordToStar,
                        translation: option.definition,
                        definition: option.definition
                    }],
                    timestamp: currentTimestamp
                };
                
                console.log(`[WordCard MCQ] Adding to vocabulary:`, newVocabularyItem);
                
                // Add to learnedItems first
                chrome.storage.local.get({ learnedItems: [] }, ({ learnedItems }) => {
                    const updatedLearnedItems = [...(learnedItems || []), newVocabularyItem];
                    
                    chrome.storage.local.set({ learnedItems: updatedLearnedItems }, () => {
                        console.log(`[WordCard MCQ] Added to vocabulary successfully`);
                        
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
                                    source: 'wordcard-mcq',
                                    originalContext: `MCQ ${index + 1} option for: ${word}`
                                });
                                
                                console.log(`[WordCard MCQ] Starring word:`, wordToStar);
                                
                                chrome.storage.local.set({ starredWords: starredObjects }, () => {
                                    console.log(`[WordCard MCQ] Word starred successfully`);
                                });
                            }
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
 */
function addWordToVocabulary(wordToStar, definition, originalText, source) {
    const currentTimestamp = Date.now();
    
    const newVocabularyItem = {
        originalText: originalText,
        translation: `Added from word card: ${wordToStar} (${definition})`,
        selectedWords: [{
            word: wordToStar,
            translation: definition,
            definition: definition
        }],
        timestamp: currentTimestamp
    };
    
    console.log(`[WordCard] Adding to vocabulary:`, newVocabularyItem);
    
    // Add to learnedItems first
    chrome.storage.local.get({ learnedItems: [] }, ({ learnedItems }) => {
        const updatedLearnedItems = [...(learnedItems || []), newVocabularyItem];
        
        chrome.storage.local.set({ learnedItems: updatedLearnedItems }, () => {
            console.log(`[WordCard] Added to vocabulary successfully`);
            
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
                        console.log(`[WordCard] Updated starred words:`, starredObjects);
                    });
                }
            });
        });
    });
}

/**
 * Generate card details for merged words with multiple examples
 * @param {Object} mergedWordData - Merged word data with multiple examples
 * @param {string} apiKey - API key for generating additional content
 */
async function generateMergedCardDetails(mergedWordData, apiKey) {
    try {
        // Use the same display logic as single word cards, but pass all examples as context
        const combinedContext = mergedWordData.examples.map((example, index) => 
            `Example ${index + 1}: ${example.originalText}`
        ).join('\n');
        
        // Use the original generateCardDetails function with enhanced context
        await generateCardDetails(mergedWordData.word, combinedContext, apiKey);
        
    } catch (error) {
        console.error('Error generating merged card details:', error);
        document.getElementById('example-container').innerHTML = `<p>Error loading merged details: ${error.message}</p>`;
    }
}

/**
 * Display all examples for a merged word
 * @param {Object} mergedWordData - Merged word data
 */
async function displayMergedExamples(mergedWordData) {
    const exampleContainer = document.getElementById('example-container');
    
    let examplesHtml = `
        <h3 class="examples-title">Examples in Context (${mergedWordData.examples.length})</h3>
        <div class="examples-list">
    `;
    
    mergedWordData.examples.forEach((example, index) => {
        const formattedDate = new Date(example.timestamp).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            year: 'numeric'
        });
        
        examplesHtml += `
            <div class="example-item" data-index="${index}">
                <div class="example-header">
                    <span class="example-number">${index + 1}.</span>
                    <span class="example-date">${formattedDate}</span>
                </div>
                <div class="example-content">
                    <div class="example-en">${highlightWord(example.originalText, mergedWordData.word)}</div>
                    <div class="example-cn">${example.translation}</div>
                    <div class="example-context">
                        <span class="context-translation">"${mergedWordData.word}" �?${example.contextTranslation || example.definition}</span>
                    </div>
                </div>
            </div>
        `;
    });
    
    examplesHtml += '</div>';
    
    // Add navigation if there are many examples
    if (mergedWordData.examples.length > 3) {
        examplesHtml += `
            <div class="examples-navigation">
                <button id="show-all-examples" class="toggle-examples">Show all examples</button>
            </div>
        `;
    }
    
    exampleContainer.innerHTML = examplesHtml;
    
    // Add event listeners for navigation
    if (mergedWordData.examples.length > 3) {
        const toggleButton = document.getElementById('show-all-examples');
        const examplesList = document.querySelector('.examples-list');
        let showingAll = false;
        
        // Initially show only first 3 examples
        const exampleItems = document.querySelectorAll('.example-item');
        exampleItems.forEach((item, index) => {
            if (index >= 3) {
                item.style.display = 'none';
            }
        });
        
        toggleButton.addEventListener('click', () => {
            showingAll = !showingAll;
            exampleItems.forEach((item, index) => {
                if (index >= 3) {
                    item.style.display = showingAll ? 'block' : 'none';
                }
            });
            toggleButton.textContent = showingAll ? 'Show fewer examples' : 'Show all examples';
        });
    }
}

/**
 * Highlight a word in a sentence
 * @param {string} sentence - The sentence
 * @param {string} word - The word to highlight
 * @returns {string} Sentence with highlighted word
 */
function highlightWord(sentence, word) {
    if (!sentence || !word) return sentence || '';
    
    const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(\\b${escapedWord}\\b)`, 'gi');
    return sentence.replace(regex, '<strong class="highlight-word">$1</strong>');
}

/**
 * Generate equivalent and confusable words for merged word cards
 * @param {string} word - The target word
 * @param {string} contextText - Context sentence for the word
 * @param {string} apiKey - API key for generating content
 */
async function generateWordLists(word, contextText, apiKey) {
    try {
        const getCardPrompt = (word, context) => {
            return `You are an expert in vocabulary and language assessment, specializing in GRE preparation. Your task is to analyze the provided English word and its original context.

Word: "${word}"
Context: "${context}"

Generate the following information, ensuring all definitions are in Simplified Chinese:
1. **Confusing Words:** An array of objects for words similar in spelling or pronunciation but with different meanings. Each object must have "word" and "definition" keys. The key for this array in the JSON should be "confusable_words".
2. **Equivalent Words:** An array of objects for words with meanings similar to the main word ("${word}"). These are crucial for GRE sentence equivalence. Each object must have "word" and "definition" keys. The key for this array in the JSON should be "equivalent_words".

You must return the result as a single, valid JSON object with NO other text or markdown.

Example format:
{
  "confusable_words": [
    {"word": "relict", "definition": "残遗的生物或地貌"},
    {"word": "relish", "definition": "享受"}
  ],
  "equivalent_words": [
    {"word": "vestige", "definition": "更偏�?痕迹'，可用于抽象概念"},
    {"word": "artifact", "definition": "特指人工制品"}
  ]
}`;
        };

        const prompt = getCardPrompt(word, contextText);
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-preview-06-17:generateContent?key=${apiKey}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

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

        // Populate the word lists
        populateList(document.getElementById('confusable-words-list'), cardData.confusable_words);
        populateList(document.getElementById('equivalent-words-list'), cardData.equivalent_words);

    } catch (error) {
        console.error('Error generating word lists:', error);
        // Provide fallback content
        document.getElementById('confusable-words-list').innerHTML = '<li>Unable to load confusable words</li>';
        document.getElementById('equivalent-words-list').innerHTML = '<li>Unable to load equivalent words</li>';
    }
}
