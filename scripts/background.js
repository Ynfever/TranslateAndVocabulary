// background.js

// Default API key (for backward compatibility)
const DEFAULT_API_KEY = 'AIzaABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';

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

// Get API key from storage
async function getApiKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['geminiApiKey'], (result) => {
      resolve(result.geminiApiKey || DEFAULT_API_KEY);
    });
  });
}

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // First time installation - check if user has API key
    chrome.storage.local.get(['geminiApiKey'], (result) => {
      if (!result.geminiApiKey) {
        // Open welcome page for first-time setup
        chrome.tabs.create({
          url: chrome.runtime.getURL('views/welcome.html')
        });
      }
    });
  }
});


// Listen for messages from the content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "translate") {
    handleTranslateRequest(request.text, sendResponse);
    return true; // Keep the message channel open for async response
  } else if (request.action === "apiKeyUpdated") {
    // Handle API key update notification
    console.log("API key has been updated");
  }
});

async function handleTranslateRequest(text, sendResponse) {
  try {
    const apiKey = await getApiKey();
    
    if (!apiKey) {
      sendResponse({ 
        success: false, 
        error: "No API key configured. Please set up your Gemini API key in the extension settings." 
      });
      return;
    }

    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-preview-06-17:generateContent?key=${apiKey}`;
    const promptText = getPrompt(text);
    console.log('Sending prompt to Gemini API:', promptText);
    
    // Add timeout to the fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 second timeout
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }]
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    
    if (!response.ok) {
      if (response.status === 400) {
        throw new Error('Invalid API key or request. Please check your API key in settings.');
      } else if (response.status === 403) {
        throw new Error('API key access denied. Please check your API key permissions.');
      } else {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    }

    const data = await response.json();
    
    // Check if the response has the expected structure
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
      throw new Error('Invalid response structure from API');
    }
    
    // Extract the response text from the API
    let responseText = data.candidates[0].content.parts[0].text;
    let originalResponseText = responseText; // Keep original for debugging
    console.log('Raw response from Gemini API:', responseText);
    
    // Remove markdown code block formatting if present
    if (responseText.includes('```json')) {
      responseText = responseText.replace(/```json\s*/, '').replace(/```\s*$/, '');
    } else if (responseText.includes('```')) {
      responseText = responseText.replace(/```\s*/, '').replace(/```\s*$/, '');
    }
    
    // Parse the cleaned JSON string
    const result = JSON.parse(responseText.trim());
    
    // Validate the result structure
    if (!result.full_translation || !result.vocabulary) {
      throw new Error('Invalid JSON structure in API response');
    }
    
    sendResponse({ success: true, data: result });
    
  } catch (error) {
    console.error('Error fetching from Gemini API:', error);
    let errorMessage = error.message;
    if (error.name === 'AbortError') {
      errorMessage = 'Request timed out';
    } else if (error.message.includes('Failed to fetch')) {
      errorMessage = 'Network connection failed';
    }
    
    sendResponse({ success: false, error: errorMessage });
  }
}