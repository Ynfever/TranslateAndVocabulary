// options.js
document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const toggleApiKeyBtn = document.getElementById('toggleApiKey');
  const saveBtn = document.getElementById('saveBtn');
  const testBtn = document.getElementById('testBtn');
  const status = document.getElementById('status');

  // Load saved settings
  loadSettings();

  // Toggle API key visibility
  toggleApiKeyBtn.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleApiKeyBtn.textContent = '🙈';
    } else {
      apiKeyInput.type = 'password';
      toggleApiKeyBtn.textContent = '👁️';
    }
  });

  // Save settings
  saveBtn.addEventListener('click', saveSettings);

  // Test API key
  testBtn.addEventListener('click', testApiKey);

  // Auto-save on input change
  apiKeyInput.addEventListener('input', () => {
    // Clear status when user starts typing
    status.textContent = '';
    status.className = 'status';
  });

  function loadSettings() {
    chrome.storage.local.get(['geminiApiKey'], (result) => {
      if (result.geminiApiKey) {
        apiKeyInput.value = result.geminiApiKey;
      }
    });
  }

  function saveSettings() {
    const apiKey = apiKeyInput.value.trim();
    
    if (!apiKey) {
      showStatus('Please enter an API key', 'error');
      return;
    }

    if (!isValidApiKey(apiKey)) {
      showStatus('Invalid API key format. Please check your key.', 'error');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = '💾 Saving...';

    chrome.storage.local.set({ geminiApiKey: apiKey }, () => {
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 Save Settings';
      
      if (chrome.runtime.lastError) {
        showStatus('Failed to save settings: ' + chrome.runtime.lastError.message, 'error');
      } else {
        showStatus('✅ Settings saved successfully!', 'success');
        
        // Notify background script that API key has been updated
        chrome.runtime.sendMessage({ action: 'apiKeyUpdated' });
      }
    });
  }

  function testApiKey() {
    const apiKey = apiKeyInput.value.trim();
    
    if (!apiKey) {
      showStatus('Please enter an API key first', 'error');
      return;
    }

    testBtn.disabled = true;
    testBtn.textContent = '🧪 Testing...';
    showStatus('Testing API key...', 'info');

    // Test with a simple request
    const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-preview-06-17:generateContent?key=${apiKey}`;
    
    fetch(testUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Hello" }] }]
      })
    })
    .then(response => {
      testBtn.disabled = false;
      testBtn.textContent = '🧪 Test API Key';
      
      if (response.ok) {
        showStatus('✅ API key is working correctly!', 'success');
      } else if (response.status === 400) {
        showStatus('❌ Invalid API key. Please check your key.', 'error');
      } else if (response.status === 403) {
        showStatus('❌ API key access denied. Please check permissions.', 'error');
      } else {
        showStatus(`❌ API test failed (Status: ${response.status})`, 'error');
      }
    })
    .catch(error => {
      testBtn.disabled = false;
      testBtn.textContent = '🧪 Test API Key';
      showStatus('❌ Network error. Please check your connection.', 'error');
      console.error('API test error:', error);
    });
  }

  function isValidApiKey(apiKey) {
    // Basic validation for Gemini API key format
    return apiKey.length > 20 && apiKey.startsWith('AIza');
  }

  function showStatus(message, type) {
    status.textContent = message;
    status.className = `status ${type}`;
    
    // Auto-clear success messages after 3 seconds
    if (type === 'success') {
      setTimeout(() => {
        status.textContent = '';
        status.className = 'status';
      }, 3000);
    }
  }
});
