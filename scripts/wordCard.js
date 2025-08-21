document.addEventListener('DOMContentLoaded', () => {
    const wordElement = document.getElementById('word');
    const definitionElement = document.getElementById('definition');
    const confusableWordsList = document.getElementById('confusable-words-list');
    const equivalentWordsList = document.getElementById('equivalent-words-list');
    
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

    if (word && timestamp) {
        chrome.storage.local.get(['geminiApiKey', 'learnedItems'], (data) => {
            const apiKey = data.geminiApiKey;
            const learnedItems = data.learnedItems || [];
            
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
                
                generateCardDetails(word, learnedItem.originalText, apiKey);
            } else {
                wordElement.textContent = 'Error';
                definitionElement.textContent = 'Could not find API key or learned item.';
            }
        });
    }
});

async function generateCardDetails(word, originalText, apiKey) {
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

        // Populate Confusable and Equivalent Words
        populateList(document.getElementById('confusable-words-list'), cardData.confusable_words);
        populateList(document.getElementById('equivalent-words-list'), cardData.equivalent_words);

        // Check for MCQ or Example Sentence
        if (cardData.mcq) {
            displayMCQ(cardData.mcq, word);
        } else if (cardData.example) {
            displayExample(cardData.example, word);
        }

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

            // Add a one-time click listener to reveal the definition
            li.addEventListener('click', () => {
                li.textContent += ` (${item.definition})`;
            }, { once: true });

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
        li.dataset.state = 'unanswered'; // States: unanswered, revealed

        li.addEventListener('click', () => {
            if (li.dataset.state === 'unanswered') {
                if (correctAnswers.includes(li.dataset.word)) {
                    li.classList.add('correct');
                } else {
                    li.classList.add('incorrect');
                }
                li.dataset.state = 'revealed';
            } else if (li.dataset.state === 'revealed') {
                // On second click of a correct answer, show definition
                if (option.definition) {
                    // Prevent adding definition multiple times
                    if (!li.textContent.includes(option.definition)) {
                        li.textContent = `${option.word} (${option.definition})`;
                    }
                }
            }
        });
        optionsListElement.appendChild(li);
    });
}