document.addEventListener('DOMContentLoaded', () => {
  const vocabList = document.getElementById('vocabulary-list');
  const summaryDiv = document.getElementById('summary');

  // Helper function to get a display-friendly date string
  function getDisplayDate(dateKey) {
    const date = new Date(dateKey + 'T00:00:00'); // Treat dateKey as local date
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const isSameDay = (d1, d2) =>
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();

    if (isSameDay(date, today)) return 'Today';
    if (isSameDay(date, yesterday)) return 'Yesterday';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  chrome.storage.local.get({ learnedItems: [] }, (result) => {
    const learnedItems = result.learnedItems;

    if (learnedItems.length === 0) {
      summaryDiv.innerHTML = '<p>Total words learned: <strong>0</strong></p>';
      vocabList.innerHTML = '<p>Your vocabulary list is empty. Start by selecting text on any webpage!</p>';
      return;
    }

    // Group items by date (YYYY-MM-DD)
    const groupedByDate = learnedItems.reduce((acc, item) => {
      const dateKey = new Date(item.timestamp).toISOString().split('T')[0];
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(item);
      return acc;
    }, {});

    // Sort date groups chronologically (most recent first)
    const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

    let totalWords = 0;
    vocabList.innerHTML = ''; // Clear the list for new content

    sortedDates.forEach(dateKey => {
      const items = groupedByDate[dateKey];
      // Sort items within each day by timestamp (most recent first)
      items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      const dailyWordCount = items.reduce((sum, item) => sum + item.selectedWords.length, 0);
      totalWords += dailyWordCount;

      // Create and append the date header
      const dateHeader = document.createElement('div');
      dateHeader.className = 'date-header';
      dateHeader.innerHTML = `<h2>${getDisplayDate(dateKey)}</h2><span>${dailyWordCount} words</span>`;
      vocabList.appendChild(dateHeader);

      // Create and append vocab cards for the day
      items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'vocab-card';

        const highlight = (text, words, isChinese = false) => {
          let highlightedText = text;
          words.forEach(vocab => {
            const target = isChinese ? vocab.translation : vocab.word;
            const regex = new RegExp(`(${target})`, 'gi');
            highlightedText = highlightedText.replace(regex, '<strong>$1</strong>');
          });
          return highlightedText;
        };

        const originalP = document.createElement('p');
        originalP.innerHTML = highlight(item.originalText, item.selectedWords);

        const translationP = document.createElement('p');
        translationP.innerHTML = highlight(item.translation, item.selectedWords, true);

        const wordsDiv = document.createElement('div');
        wordsDiv.className = 'selected-words';
        wordsDiv.innerHTML = item.selectedWords.map(v =>
          `<span class="word-tag"><strong>${v.word}</strong>: ${v.translation} (${v.definition})</span>`
        ).join('');

        card.appendChild(originalP);
        card.appendChild(translationP);
        card.appendChild(wordsDiv);
        vocabList.appendChild(card);
      });
    });

    // Update the total word count in the summary
    summaryDiv.innerHTML = `<p>Total words learned: <strong>${totalWords}</strong></p>`;
  });
});
