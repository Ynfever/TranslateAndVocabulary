// background.js

const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

// The prompt we designed earlier
function getPrompt(text) {
  return `You are an expert translator and vocabulary analyst. Your task is to process the user-provided English text.
You must perform the following actions and return the result as a single, valid JSON object with NO other text or markdown.

The JSON object must have the following keys:
1. "full_translation": A string containing the full Simplified Chinese translation of the entire text.
2. "vocabulary": An array of objects. Each object represents a key or difficult word and must have the following three keys:
   - "word": The English word itself.
   - "definition": A concise Simplified Chinese definition of the word.
   - "translation_in_context": The most appropriate Simplified Chinese translation of the word in the context of the original text.

Here is the English text to process:
"${text}"`;
}


// Listen for messages from the content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "translate") {
    const promptText = getPrompt(request.text);
    
    fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }]
      })
    })
    .then(response => response.json())
    .then(data => {
      // Extract the clean JSON string from the response
      const jsonString = data.candidates[0].content.parts[0].text;
      const result = JSON.parse(jsonString);
      sendResponse({ success: true, data: result });
    })
    .catch(error => {
      console.error('Error fetching from Gemini API:', error);
      sendResponse({ success: false, error: error.message });
    });

    // Return true to indicate you wish to send a response asynchronously
    return true;
  }
});