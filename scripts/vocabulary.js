document.addEventListener('DOMContentLoaded', () => {
  const vocabList = document.getElementById('vocabulary-list');

  chrome.storage.local.get({ learnedItems: [] }, (result) => {
    const learnedItems = result.learnedItems.reverse(); // Newest first

    if (learnedItems.length === 0) {
      vocabList.innerHTML = '<p>Your vocabulary list is empty. Start by selecting text on any webpage!</p>';
      return;
    }

    learnedItems.forEach(item => {
      const card = document.createElement('div');
      card.className = 'vocab-card';

      // Highlight function
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
      originalP.innerHTML = `${highlight(item.originalText, item.selectedWords)}`;

      const translationP = document.createElement('p');
      translationP.innerHTML = `${highlight(item.translation, item.selectedWords, true)}`;

      const wordsDiv = document.createElement('div');
      wordsDiv.className = 'selected-words';
      wordsDiv.innerHTML = item.selectedWords.map(v => {
        return `<span class="word-tag"><strong>${v.word}</strong>: ${v.translation} (${v.definition})</span>`;
      }).join('');

      card.appendChild(originalP);
      card.appendChild(translationP);
      card.appendChild(wordsDiv);
      vocabList.appendChild(card);
    });
  });
});
