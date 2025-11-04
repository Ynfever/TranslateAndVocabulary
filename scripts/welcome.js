// welcome.js
document.getElementById('openSettings').addEventListener('click', () => {
  // Simply open the options page in a new tab
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
    // Extension context - use chrome API to get the correct URL
    const optionsUrl = chrome.runtime.getURL('views/options.html');
    chrome.tabs.create({ url: optionsUrl });
  } else {
    // Fallback for testing outside extension context
    window.location.href = 'options.html';
  }
});
