document.addEventListener('DOMContentLoaded', () => {
  const wordList = document.getElementById('word-list');
  const settingsBtn = document.getElementById('settings-btn');

  // Settings button click handler
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  chrome.storage.local.get({ learnedItems: [] }, (result) => {
    const learnedItems = result.learnedItems;
    if (learnedItems.length === 0) {
      wordList.innerHTML = '<p>No words saved yet.</p>';
      return;
    }

    wordList.innerHTML = ''; // Clear the list
    const recentItems = learnedItems.slice(-5).reverse(); // Get last 5, newest first

    recentItems.forEach(item => {
      if (item.selectedWords && item.selectedWords.length > 0) {
        const entryDiv = document.createElement('div');
        entryDiv.className = 'word-entry';

        const wordsP = document.createElement('p');
        wordsP.className = 'words';
        wordsP.innerHTML = item.selectedWords.map(v => `<strong>${v.word}</strong>: ${v.translation}`).join(', ');
        
        const contextP = document.createElement('p');
        contextP.className = 'context';
        contextP.textContent = `From: "${item.originalText.substring(0, 50)}..."`;

        entryDiv.appendChild(wordsP);
        entryDiv.appendChild(contextP);
        wordList.appendChild(entryDiv);
      }
    });
  });
});
