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

    // If the click was on our popup or icon, don't do anything
    if (e.target.closest('#tt-popup') || e.target.closest('#tt-icon')) {
      return;
    }

    // Remove previous icon and popup only if we're not clicking on them
    removeElements();

    if (selectedText.length > 0) {
      const selection = window.getSelection();
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // Create and position the icon
      const icon = document.createElement('div');
      icon.id = 'tt-icon';
      icon.style.position = 'absolute';
      icon.style.top = `${window.scrollY + rect.top - 28}px`;
      icon.style.left = `${window.scrollX + rect.right + 5}px`;
      icon.style.zIndex = '10000';
      
      document.body.appendChild(icon);
      currentIcon = icon;
      
      icon.addEventListener('click', (event) => {
        event.stopPropagation();
        event.preventDefault();
        showPopup(rect.bottom + window.scrollY, rect.left + window.scrollX, selectedText);
        icon.style.display = 'none';
      });
    }
  }, 10);
});

// Remove icon/popup if user clicks elsewhere
document.addEventListener('mousedown', (e) => {
    // Only remove if the click is not on our popup, icon, or any of their children
    if (!e.target.closest('#tt-popup') && !e.target.closest('#tt-icon')) {
        // Add a small delay to prevent immediate removal when popup is being created
        setTimeout(() => {
            removeElements();
        }, 50);
    }
});


function showPopup(top, left, text) {
    // Check if extension context is still valid
    if (!chrome.runtime || !chrome.runtime.id) {
        console.error('Extension context invalidated. Please refresh the page.');
        return;
    }

    // Create popup structure
    const popup = document.createElement('div');
    popup.id = 'tt-popup';
    popup.style.position = 'absolute';
    popup.style.top = `${top + 20}px`;
    popup.style.left = `${left}px`;
    popup.style.zIndex = '100000';

    const translationDiv = document.createElement('div');
    translationDiv.className = 'tt-popup-translation';
    translationDiv.textContent = 'Translating...';

    const vocabularyDiv = document.createElement('div');
    vocabularyDiv.className = 'tt-popup-vocabulary';

    popup.appendChild(translationDiv);
    popup.appendChild(vocabularyDiv);
    document.body.appendChild(popup);
    currentPopup = popup;

    // Prevent the popup from being removed by mouse events
    popup.addEventListener('mousedown', (e) => {
        e.stopPropagation();
    });
    
    popup.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Send message to background script to get translation
    let messageTimeout;
    let responseReceived = false;

    // Send message to background script to get translation
    try {
        chrome.runtime.sendMessage({ action: 'translate', text: text }, (response) => {
        // Check if extension context is invalidated
        if (chrome.runtime.lastError) {
            console.error('Extension context error:', chrome.runtime.lastError.message);
            translationDiv.textContent = 'Extension error. Please refresh the page and try again.';
            return;
        }

        if (response && response.success) {
            const { full_translation, vocabulary } = response.data;
            translationDiv.textContent = full_translation;
            
            let selectedWords = [];

            vocabulary.forEach(vocabItem => {
            const pill = document.createElement('div');
            pill.className = 'tt-vocab-pill';
            // Display word with its Chinese translation
            pill.innerHTML = `<strong>${vocabItem.word}</strong>: ${vocabItem.translation_in_context}`;
            pill.dataset.word = vocabItem.word;
            pill.dataset.translation = vocabItem.translation_in_context;
            pill.dataset.definition = vocabItem.definition;
            vocabularyDiv.appendChild(pill);
            
            pill.addEventListener('click', () => {
                pill.classList.toggle('selected');
                
                // Update the list of selected words with full vocab data
                if (pill.classList.contains('selected')) {
                    selectedWords.push({
                        word: vocabItem.word,
                        translation: vocabItem.translation_in_context,
                        definition: vocabItem.definition
                    });
                } else {
                    selectedWords = selectedWords.filter(item => item.word !== vocabItem.word);
                }
            });
        });

        // Save data when the popup is removed (by clicking outside)
        const observer = new MutationObserver((mutations) => {
        for(const mutation of mutations) {
            if (mutation.removedNodes) {
                for(const node of mutation.removedNodes) {
                    if (node.id === 'tt-popup' && selectedWords.length > 0) {
                        console.log('Saving selected words:', selectedWords);
                        saveData(text, full_translation, selectedWords);
                        observer.disconnect(); // Clean up observer
                        return;
                    }
                }
            }
        }
        });
        observer.observe(document.body, { childList: true });
        } else if (response && response.error) {
            console.error('Translation error:', response.error);
            
            // Check if the error is related to API key configuration
            if (response.error.includes('No API key configured') || 
              response.error.includes('Invalid API key') || 
              response.error.includes('API key access denied')) {
              // Show error message
              translationDiv.innerHTML = `
                <div style="color: #d73a49; margin-bottom: 8px;">⚠️ ${response.error}</div>
              `;

              // Create "Open Settings" button with a click handler in the
              // content-script context so we can safely call chrome.runtime
              const settingsButton = document.createElement('button');
              settingsButton.textContent = 'Open Settings';
              settingsButton.style.cssText = `
                background: #0366d6;
                color: white;
                border: none;
                padding: 4px 8px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
              `;

              // 通过发送消息让 background.js 打开设置页
              settingsButton.addEventListener('click', () => {
                if (chrome.runtime && chrome.runtime.sendMessage) {
                  chrome.runtime.sendMessage({ action: 'openOptionsPage' });
                } else {
                  console.error('Cannot send message to background script');
                }
              });

              translationDiv.appendChild(settingsButton);
            } else {
              translationDiv.textContent = `Translation failed: ${response.error}`;
            }
        } else {
            console.error('No response received from background script');
            translationDiv.textContent = 'No response received. Please try again.';
        }
    });
    } catch (error) {
        console.error('Extension context error:', error.message);
        translationDiv.textContent = 'Extension error. Please refresh the page and try again.';
    }
}

function saveData(originalText, translation, selectedWords) {
  const newItem = {
    originalText,
    translation,
    selectedWords, // Now contains objects with word, translation, and definition
    timestamp: new Date().toISOString()
  };

  // Check if extension context is still valid before attempting to save
  if (!chrome.runtime || !chrome.runtime.id) {
    console.error('Extension context invalidated. Cannot save data.');
    return;
  }

  chrome.storage.local.get({ learnedItems: [] }, (result) => {
    if (chrome.runtime.lastError) {
      console.error('Storage error:', chrome.runtime.lastError.message);
      return;
    }
    
    const learnedItems = result.learnedItems;
    
    // Use vocabulary merger to handle duplicate words
    const merger = new VocabularyMerger();
    const mergeResult = merger.processNewWords(newItem, learnedItems);
    
    console.log('Merge result:', {
      mergedWords: mergeResult.mergedWords,
      totalItems: mergeResult.updatedItems.length
    });

    // Save merged vocabulary data separately for easy access
    const mergedVocabulary = Object.fromEntries(merger.getMergedVocabulary());
    
    chrome.storage.local.set({ 
      learnedItems: mergeResult.updatedItems,
      mergedVocabulary: mergedVocabulary
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Save error:', chrome.runtime.lastError.message);
      } else {
        console.log('Data saved successfully with merged vocabulary!', {
          newItem,
          mergedWords: mergeResult.mergedWords,
          vocabularyStats: merger.getStatistics()
        });
      }
    });
  });
}