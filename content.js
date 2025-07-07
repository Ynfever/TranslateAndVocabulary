// content.js

let currentIcon = null;
let currentPopup = null;

// Function to remove existing elements
function removeElements() {
  if (currentIcon) {
    currentIcon.remove();
    currentIcon = null;
  }
  if (currentPopup) {
    currentPopup.remove();
    currentPopup = null;
  }
}

document.addEventListener('mouseup', (e) => {
  // Use a short delay to allow click events on existing elements to fire
  setTimeout(() => {
    const selectedText = window.getSelection().toString().trim();

    // If the click was on our popup, don't do anything
    if (e.target.closest('#tt-popup')) {
      return;
    }

    // Remove previous icon and popup
    removeElements();

    if (selectedText.length > 0) {
      const selection = window.getSelection();
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // Create and position the icon
      const icon = document.createElement('div');
      icon.id = 'tt-icon';
      icon.style.top = `${window.scrollY + rect.top - 28}px`; // Position above the selection
      icon.style.left = `${window.scrollX + rect.right}px`;
      
      document.body.appendChild(icon);
      currentIcon = icon;
      
      icon.addEventListener('click', (event) => {
        event.stopPropagation(); // Prevent mouseup from firing again
        showPopup(icon.style.top, icon.style.left, selectedText);
        icon.style.display = 'none'; // Hide icon after click
      });
    }
  }, 10);
});

// Remove icon/popup if user clicks elsewhere
document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('#tt-popup') && !e.target.closest('#tt-icon')) {
        removeElements();
    }
});


function showPopup(top, left, text) {
  // Create popup structure
  const popup = document.createElement('div');
  popup.id = 'tt-popup';
  popup.style.top = top;
  popup.style.left = left;

  const translationDiv = document.createElement('div');
  translationDiv.className = 'tt-popup-translation';
  translationDiv.textContent = 'Translating...';

  const vocabularyDiv = document.createElement('div');
  vocabularyDiv.className = 'tt-popup-vocabulary';

  popup.appendChild(translationDiv);
  popup.appendChild(vocabularyDiv);
  document.body.appendChild(popup);
  currentPopup = popup;

  // Send message to background script to get translation
  chrome.runtime.sendMessage({ action: 'translate', text: text }, (response) => {
    if (response && response.success) {
      const { full_translation, vocabulary } = response.data;
      translationDiv.textContent = full_translation;
      
      let selectedWords = [];

      vocabulary.forEach(vocabItem => {
        const pill = document.createElement('div');
        pill.className = 'tt-vocab-pill';
        pill.textContent = vocabItem.word;
        pill.dataset.word = vocabItem.word; // Store word for saving
        vocabularyDiv.appendChild(pill);
        
        pill.addEventListener('click', () => {
          pill.classList.toggle('selected');
          
          // Update the list of selected words
          if (pill.classList.contains('selected')) {
            selectedWords.push(vocabItem.word);
          } else {
            selectedWords = selectedWords.filter(w => w !== vocabItem.word);
          }

          // When popup is closed, data will be saved.
          // We can also add a save button. Here, we'll save on close.
        });
      });

      // Save data when the popup is removed (by clicking outside)
      const observer = new MutationObserver((mutations) => {
        for(const mutation of mutations) {
            if (mutation.removedNodes) {
                for(const node of mutation.removedNodes) {
                    if (node.id === 'tt-popup' && selectedWords.length > 0) {
                        saveData(text, full_translation, selectedWords);
                        observer.disconnect(); // Clean up observer
                        return;
                    }
                }
            }
        }
      });
      observer.observe(document.body, { childList: true });

    } else {
      translationDiv.textContent = 'Error: Could not translate.';
      console.error(response.error);
    }
  });
}

function saveData(originalText, translation, selectedWords) {
  const newItem = {
    originalText,
    translation,
    selectedWords,
    timestamp: new Date().toISOString()
  };

  chrome.storage.local.get({ learnedItems: [] }, (result) => {
    const learnedItems = result.learnedItems;
    learnedItems.push(newItem);
    chrome.storage.local.set({ learnedItems }, () => {
      console.log('Data saved successfully!');
    });
  });
}