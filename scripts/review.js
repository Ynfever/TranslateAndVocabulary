document.addEventListener('DOMContentLoaded', () => {
    const backButton = document.getElementById('back-button');
    const nextButton = document.getElementById('next-button');
    const currentWordEl = document.getElementById('current-word');
    const totalWordsEl = document.getElementById('total-words');
    const wordCardContainer = document.getElementById('word-card-container');

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

    let allWords = [];
    let currentIndex = 0;
    let apiKey = '';
    let cardDataCache = new Map();
    const PRELOAD_COUNT = 3;

    function loadWords() {
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

        chrome.storage.local.get(['learnedItems', 'geminiApiKey'], (data) => {
            apiKey = data.geminiApiKey;
            let learnedItems = data.learnedItems || [];
            
            if (learnedItems.length === 0) {
                console.log("Using mock data for review.");
                learnedItems = mockLearnedItems;
            }

            allWords = learnedItems.flatMap(item => 
                item.selectedWords.map(word => ({ ...word, timestamp: item.timestamp, originalText: item.originalText }))
            );

            if (allWords.length > 0) {
                updateReviewState();
            } else {
                displayNoWordsMessage();
            }
        });
    }

    function updateReviewState() {
        totalWordsEl.textContent = allWords.length;
        currentWordEl.textContent = currentIndex + 1;
        const wordData = allWords[currentIndex];
        if (wordData) {
            wordElement.textContent = wordData.word;
            definitionElement.textContent = wordData.definition;
            
            if (cardDataCache.has(wordData.word)) {
                populateCard(cardDataCache.get(wordData.word), wordData.word);
            } else {
                generateCardDetails(wordData.word, wordData.originalText, apiKey, false);
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
                generateCardDetails(nextWordData.word, nextWordData.originalText, apiKey, true);
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
            currentIndex = (currentIndex + 1) % allWords.length;
            updateReviewState();
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

    async function generateCardDetails(word, originalText, apiKey, isPreload = false) {
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

        const getCardPrompt = (word, context) => {
            return `You are an expert in vocabulary and language assessment, specializing in GRE preparation. Your task is to analyze the provided English word and its original context.

Word: "${word}"
Context: "${context}"

First, generate the following information, ensuring all definitions are in Simplified Chinese:
1.  **Confusing Words:** An array of objects for words similar in spelling or pronunciation but with different meanings. Each object must have "word" and "definition" keys. The key for this array in the JSON should be "confusable_words".
2.  **Equivalent Words:** An array of objects for words with meanings similar to the main word ("${word}"). These are crucial for GRE sentence equivalence. Each object must have "word" and "definition" keys. The key for this array in the JSON should be "equivalent_words". This list should contain synonyms for "${word}" and should NOT be influenced by the correct answers if the context is a multiple-choice question.

Next, analyze the context and determine if it is a regular example sentence or a GRE-style multiple-choice question (MCQ).
- If it's a regular sentence, provide an "example" object containing the original "sentence", its "translation" in Chinese, and the specific "translated_word" for "${word}" in the context of the sentence.
- If it's an MCQ, follow these GRE rules:
    1.  The question may have one or two correct answers.
    2.  If there are two correct answers, they must be synonyms that create sentences with the same meaning.
    3.  **Crucially, the main word of this card ("${word}") is provided for context and is NOT necessarily a correct answer.**
    4.  Provide the result as an "mcq" object containing "question", an array of "options" objects (each with "word" and "definition" in Simplified Chinese), and an array of "correct_answers".

You must return the result as a single, valid JSON object with NO other text or markdown.

Example:
Word: relic
Context: His political view, harking back to the turmoil in the 1934, is a _____ with no bearing on the present. prototype pretense paradigm relic contradiction vestige

You should return:
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
}
`;
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
            cardDataCache.set(word, cardData);

            if (!isPreload) {
                populateCard(cardData, word);
            }
    
        } catch (error) {
            console.error('Error generating word card details:', error);
            if (!isPreload) {
                exampleContainer.style.display = 'block';
                exampleTextElement.innerHTML = `<p>Error loading details: ${error.message}</p>`;
            }
        }
    }

    function populateCard(cardData, word) {
        populateList(confusableWordsList, cardData.confusable_words);
        populateList(equivalentWordsList, cardData.equivalent_words);

        if (cardData.mcq) {
            displayMCQ(cardData.mcq, word);
        } else if (cardData.example) {
            displayExample(cardData.example, word);
        }
    }
    
    function populateList(listElement, items) {
        listElement.innerHTML = '';
        if (items && items.length > 0) {
            items.forEach(item => {
                const li = document.createElement('li');
                li.textContent = item.word;
    
                li.addEventListener('click', () => {
                    if (!li.textContent.includes(item.definition)) {
                        li.textContent += ` (${item.definition})`;
                    }
                }, { once: true });
    
                listElement.appendChild(li);
            });
        } else {
            listElement.innerHTML = '<li>None found</li>';
        }
    }
    
    function displayExample(exampleData, word) {
        exampleContainer.style.display = 'block';
        mcqContainer.style.display = 'none';
        
        const regex = new RegExp(`\\b(${word})\\b`, 'gi');
        const highlightedSentence = exampleData.sentence.replace(regex, '<strong>$1</strong>');
        
        const highlightedTranslation = exampleData.translation.replace(exampleData.translated_word, `<strong>${exampleData.translated_word}</strong>`);
    
        exampleTextElement.innerHTML = `${highlightedSentence}<br><br>${highlightedTranslation}`;
    }
    
    function displayMCQ(mcq, word) {
        mcqContainer.style.display = 'block';
        exampleContainer.style.display = 'none';
        
        const regex = new RegExp(`\\b(${word})\\b`, 'gi');
        const highlightedQuestion = mcq.question.replace(regex, '<strong>$1</strong>');
        mcqQuestionElement.innerHTML = highlightedQuestion;
        
        mcqOptionsListElement.innerHTML = '';
    
        const correctAnswers = mcq.correct_answers || [mcq.correct_answer];
    
        mcq.options.forEach(option => {
            const li = document.createElement('li');
            li.textContent = option.word;
            li.dataset.word = option.word; 
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
                    }
                }
            });
            mcqOptionsListElement.appendChild(li);
        });
    }

    // Initial load
    loadWords();
});
