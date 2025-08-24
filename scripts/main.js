document.addEventListener('DOMContentLoaded', () => {
  const vocabRoot = document.getElementById('vocab');
  const overviewTotal = document.getElementById('overview-total');
  const overviewDaily = document.getElementById('overview-daily');
  const overviewUnit = document.getElementById('overview-unit');
  const overviewStar = document.getElementById('overview-star');
  const workspace = document.getElementById('workspace');
  const pageRoot = document.getElementById('page');
  const cardPanel = document.getElementById('card-panel');
  const cardFrame = document.getElementById('word-card-frame');

  // Initialize vocabulary merger
  const vocabularyMerger = new VocabularyMerger();

  // Function to initialize merged vocabulary from storage
  function initializeMergedVocabulary(learnedItems, callback) {
    // Check if we have already merged vocabulary in storage
    chrome.storage.local.get(['mergedVocabulary'], (result) => {
      if (result.mergedVocabulary && Object.keys(result.mergedVocabulary).length > 0) {
        // Load existing merged vocabulary
        const mergedMap = new Map(Object.entries(result.mergedVocabulary));
        vocabularyMerger.mergedVocabulary = mergedMap;
        console.log('Loaded existing merged vocabulary:', vocabularyMerger.getStatistics());
      } else {
        // Merge existing vocabulary and save it
        const mergedItems = vocabularyMerger.mergeExistingVocabulary(learnedItems);
        const mergedVocabulary = Object.fromEntries(vocabularyMerger.getMergedVocabulary());
        
        chrome.storage.local.set({ 
          learnedItems: mergedItems,
          mergedVocabulary: mergedVocabulary
        }, () => {
          console.log('Initialized merged vocabulary:', vocabularyMerger.getStatistics());
        });
      }
      
      if (callback) callback();
    });
  }

  function getDisplayDate(dateKey) {
    const date = new Date(dateKey + 'T00:00:00');
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const same = (a,b) => a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
  if (same(date, today)) return 'Today';
    if (same(date, yesterday)) return 'Yesterday';
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  }

  function groupByDate(items) {
    return items.reduce((acc, item) => {
      const dateKey = new Date(item.timestamp).toISOString().split('T')[0];
      (acc[dateKey] ||= []).push(item);
      return acc;
    }, {});
  }
  function getLocalDateKey(ts) {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function groupByDate(items) {
    return items.reduce((acc, item) => {
      const dateKey = getLocalDateKey(item.timestamp);
      (acc[dateKey] ||= []).push(item);
      return acc;
    }, {});
  }

  function render(groups) {
    vocabRoot.innerHTML = '';
    const dates = Object.keys(groups).sort((a,b) => b.localeCompare(a));
    dates.forEach(dateKey => {
      // Fix sorting by converting timestamps to numbers for proper comparison
      const items = groups[dateKey].sort((a,b) => {
        const timestampA = new Date(a.timestamp).getTime();
        const timestampB = new Date(b.timestamp).getTime();
        return timestampB - timestampA; // newest first
      });
      
      // Count unique words across all items in this date group
      const uniqueWords = new Set();
      items.forEach(item => {
        (item.selectedWords || []).forEach(w => {
          uniqueWords.add(w.word.toLowerCase());
        });
      });
      const count = uniqueWords.size;

      const groupEl = document.createElement('section');
      groupEl.className = 'date-group';
  const header = document.createElement('div');
  header.className = 'date-header';
  header.innerHTML = `<div class="day-wrap"><div class="day headland">${getDisplayDate(dateKey)}</div><div class="underline"></div></div><div class="count">${count} words</div>`;
      groupEl.appendChild(header);

      items.forEach(item => {
        const block = document.createElement('div');
        block.className = 'block';

        // bilingual pair
        const pair = document.createElement('div');
        pair.className = 'pair';

        const highlight = (text, words, isChinese = false) => {
          let result = text || '';
          (words||[]).forEach(v => {
            const target = isChinese ? (v.translation || '') : (v.word || '');
            if (!target) return;
            // wrap with <em> for bold style per spec
            const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(`(${escaped})`, 'gi');
            result = result.replace(re, '<em>$1</em>');
          });
          return result;
        };

        const cn = document.createElement('p');
        cn.innerHTML = highlight(item.translation, item.selectedWords, true);
        const en = document.createElement('p');
        en.innerHTML = highlight(item.originalText, item.selectedWords, false);
        pair.appendChild(cn);
        pair.appendChild(en);

        // divider
        const hr = document.createElement('div');
        hr.className = 'lines';

        // words row below translations
        const wordsRow = document.createElement('div');
        wordsRow.className = 'words';
        (item.selectedWords||[]).forEach(w => {
          const chip = document.createElement('span');
          chip.className = 'word-chip';
          
          // Check if this word has multiple examples
          const wordData = vocabularyMerger.getWordData(w.word);
          const hasMultipleExamples = wordData && wordData.totalOccurrences > 1;
          
          if (hasMultipleExamples) {
            chip.classList.add('merged-word');
            chip.title = `This word appears in ${wordData.totalOccurrences} sentences`;
          }
          
          const cnDef = w.translation || w.definition || '';
          const exampleCount = hasMultipleExamples ? ` (${wordData.totalOccurrences})` : '';
          
          chip.innerHTML = `<span class="en">${w.word}${exampleCount}</span><span class="cn">${cnDef ? `(${cnDef})` : ''}</span>`;
          chip.addEventListener('click', () => {
            if (hasMultipleExamples) {
              // Open merged word card with all examples
              openMergedCard(w.word);
            } else {
              // Open traditional single-context card
              openCard(w.word, item.timestamp);
            }
          });
          wordsRow.appendChild(chip);
        });

        block.appendChild(pair);
        block.appendChild(hr);
        block.appendChild(wordsRow);

        groupEl.appendChild(block);
      });

      vocabRoot.appendChild(groupEl);
    });
  }

  function setCounters(learnedItems) {
    // Count unique words across all items
    const allUniqueWords = new Set();
    learnedItems.forEach(item => {
      (item.selectedWords || []).forEach(w => {
        allUniqueWords.add(w.word.toLowerCase());
      });
    });
    const total = allUniqueWords.size;

    const todayKey = getLocalDateKey(Date.now());
    const todayUniqueWords = new Set();
    learnedItems
      .filter(it => getLocalDateKey(it.timestamp) === todayKey)
      .forEach(item => {
        (item.selectedWords || []).forEach(w => {
          todayUniqueWords.add(w.word.toLowerCase());
        });
      });
    const todayCount = todayUniqueWords.size;

    // Get review progress for all modes
    chrome.storage.local.get([
      'reviewProgress_total', 
      'reviewProgress_daily', 
      'reviewProgress_unit', 
      'reviewProgress_star',
      'starredWords'
    ], ({ reviewProgress_total, reviewProgress_daily, reviewProgress_unit, reviewProgress_star, starredWords }) => {
      
      // total vocab
      overviewTotal.querySelector('.total').textContent = `/${total}`;
      const totalProgress = (reviewProgress_total || 0) + 1;
      overviewTotal.querySelector('.current').textContent = total > 0 ? Math.min(totalProgress, total) : '0';

      // daily review
      overviewDaily.querySelector('.total').textContent = `/${todayCount}`;
      const dailyProgress = (reviewProgress_daily || 0) + 1;
      overviewDaily.querySelector('.current').textContent = todayCount > 0 ? Math.min(dailyProgress, todayCount) : '0';

      // unit test: groups of 20
      const unitTotal = Math.ceil(total / 20);
      overviewUnit.querySelector('.total').textContent = `/${unitTotal || 0}`;
      
      // Calculate current unit from review progress
      const unitProgress = (reviewProgress_unit || 0);
      const currentUnit = Math.floor(unitProgress / 20) + 1;
      const displayUnit = unitTotal > 0 ? Math.min(currentUnit, unitTotal) : 0;
      overviewUnit.querySelector('.current').textContent = displayUnit;

      // starred words
      const starredCount = (starredWords || []).length;
      overviewStar.querySelector('.total').textContent = `/${starredCount}`;
      const starProgress = (reviewProgress_star || 0) + 1;
      overviewStar.querySelector('.current').textContent = starredCount > 0 ? Math.min(starProgress, starredCount) : '0';
    });
  }

  // Function to update progress counters (can be called when progress changes)
  function updateProgressCounters() {
    chrome.storage.local.get(['learnedItems'], ({ learnedItems }) => {
      if (learnedItems) {
        setCounters(learnedItems);
      }
    });
  }

  // Listen for storage changes to update counters in real time
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local') {
        const progressKeys = ['reviewProgress_total', 'reviewProgress_daily', 'reviewProgress_unit', 'reviewProgress_star', 'starredWords'];
        const hasProgressUpdate = progressKeys.some(key => changes[key]);
        if (hasProgressUpdate) {
          updateProgressCounters();
        }
      }
    });
  }

  function openCard(word, timestamp) {
    const url = `../views/wordCard.html?word=${encodeURIComponent(word)}&timestamp=${encodeURIComponent(timestamp)}`;
    cardFrame.src = url;
    cardPanel.setAttribute('aria-hidden', 'false');
    workspace.classList.add('show-card');
    pageRoot?.classList.add('card-open');
  }

  function openMergedCard(word) {
    const wordData = vocabularyMerger.getWordData(word);
    if (!wordData) {
      console.error('No merged data found for word:', word);
      return;
    }
    
    // Use the first example's timestamp as fallback, but pass merged flag
    const firstExample = wordData.examples[0];
    const url = `../views/wordCard.html?word=${encodeURIComponent(word)}&timestamp=${encodeURIComponent(firstExample.timestamp)}&merged=true`;
    cardFrame.src = url;
    cardPanel.setAttribute('aria-hidden', 'false');
    workspace.classList.add('show-card');
    pageRoot?.classList.add('card-open');
  }

  // Auto-resize the card iframe to its content to avoid internal scrollbars
  window.addEventListener('message', (ev) => {
    const data = ev?.data;
    if (!data || data.type !== 'wordCard:height') return;
    const h = Math.max(0, Number(data.height) || 0);
    if (h > 0) {
      // Set iframe height to content height, but let card-panel handle overflow scrolling
      cardFrame.style.height = h + 'px';
    }
  });

  function goToReview(mode) {
    const url = new URL('../views/review.html', location.href);
    url.searchParams.set('mode', mode); // modes: total, daily, unit, star
    
    // For unit mode, determine which unit to go to based on progress
    if (mode === 'unit') {
      chrome.storage.local.get(['reviewProgress_unit', 'learnedItems'], ({ reviewProgress_unit, learnedItems }) => {
        const totalWords = (learnedItems || []).reduce((n, it) => n + (it.selectedWords?.length || 0), 0);
        const totalUnits = Math.ceil(totalWords / 20);
        
        if (totalUnits > 0) {
          // Calculate current unit based on review progress
          const currentProgress = reviewProgress_unit || 0;
          const currentUnit = Math.floor(currentProgress / 20) + 1;
          const normalizedUnit = Math.max(1, Math.min(currentUnit, totalUnits));
          
          url.searchParams.set('unit', normalizedUnit);
        }
        
        window.location.href = url.toString();
      });
    } else {
      window.location.href = url.toString();
    }
  }

  // overview click handlers
  overviewTotal.addEventListener('click', () => goToReview('total'));
  overviewDaily.addEventListener('click', () => goToReview('daily'));
  overviewUnit.addEventListener('click', () => goToReview('unit'));
  overviewStar.addEventListener('click', () => goToReview('star'));

  // load data
  chrome.storage.local.get({ learnedItems: [] }, ({ learnedItems }) => {
    // console.log('Raw learned items from storage:', learnedItems);
    console.log('Total items:', learnedItems?.length || 0);
    
    // Initialize merged vocabulary first
    initializeMergedVocabulary(learnedItems || [], () => {
      const groups = groupByDate(learnedItems || []);
      setCounters(learnedItems || []);
      render(groups);
    });
  });
});
