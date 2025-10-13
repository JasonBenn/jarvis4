(function() {
  const vscode = acquireVsCodeApi();
  let highlights = [];
  let selectedId = null; // Track by ID instead of index
  let checkedIds = new Set();
  let isSearchMode = false;
  let isShowingSearchInput = false; // Separate flag for showing search input
  let searchResults = [];
  let isLoading = false;
  let hasRequestedMore = false;
  let hasReachedEnd = false;

  function getSelectedIndex(displayHighlights) {
    if (!selectedId) return 0;
    const index = displayHighlights.findIndex(h => h.id === selectedId);
    return index >= 0 ? index : 0;
  }

  function checkLoadMore() {
    if (isSearchMode || isLoading || hasRequestedMore || hasReachedEnd) return;

    const displayHighlights = highlights;
    const selectedIndex = getSelectedIndex(displayHighlights);
    const threshold = Math.max(0, displayHighlights.length - 5);

    if (selectedIndex >= threshold && displayHighlights.length > 0) {
      hasRequestedMore = true;
      vscode.postMessage({ type: 'loadMore' });
    }
  }

  window.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'updateHighlights') {
      highlights = message.highlights;
      hasRequestedMore = false; // Reset for next batch
      hasReachedEnd = false; // Reset end flag on new load
      // Initialize selection to first highlight if not set or invalid
      if (!selectedId || !highlights.find(h => h.id === selectedId)) {
        selectedId = highlights.length > 0 ? highlights[0].id : null;
      }
      render();
    } else if (message.type === 'appendHighlights') {
      // Append new highlights to existing list
      if (message.highlights.length === 0) {
        // No more highlights available
        hasReachedEnd = true;
        hasRequestedMore = false;
      } else {
        highlights = highlights.concat(message.highlights);
        hasRequestedMore = false; // Allow requesting more again
      }
      // Initialize selection if not set
      if (!selectedId && highlights.length > 0) {
        selectedId = highlights[0].id;
      }
      render();
    } else if (message.type === 'searchResults') {
      // Preserve checked highlights from current list and prepend to search results
      const currentDisplayHighlights = isSearchMode ? searchResults : highlights;
      const preservedChecked = currentDisplayHighlights.filter(h => checkedIds.has(h.id));

      // Add new search results (excluding already-checked ones to avoid duplicates)
      const newResults = message.highlights.filter(h => !checkedIds.has(h.id));

      searchResults = [...preservedChecked, ...newResults];

      isSearchMode = true;
      isLoading = false; // Stop loading spinner when results arrive

      // Set focus to first unchecked highlight (after the preserved checked ones)
      const firstUncheckedIndex = preservedChecked.length;
      selectedId = searchResults[firstUncheckedIndex]?.id || (searchResults.length > 0 ? searchResults[0].id : null);

      render();
    } else if (message.type === 'bookHighlights') {
      // Insert book highlights adjacent to focused highlight
      const currentDisplayHighlights = isSearchMode ? searchResults : highlights;
      const focusedHighlight = currentDisplayHighlights.find(h => h.id === selectedId);

      if (!focusedHighlight) {
        isLoading = false;
        render();
        return;
      }

      // Get existing IDs to avoid duplicates
      const existingIds = new Set(currentDisplayHighlights.map(h => h.id));

      // Filter out duplicates from book highlights
      const newBookHighlights = message.highlights.filter(h => !existingIds.has(h.id));

      // Find the position to insert: after the last highlight from the same book
      const bookId = focusedHighlight.book_id;
      let insertIndex = currentDisplayHighlights.findIndex(h => h.id === selectedId);

      // Move forward to find the last highlight from this book
      while (
        insertIndex < currentDisplayHighlights.length - 1 &&
        currentDisplayHighlights[insertIndex + 1].book_id === bookId
      ) {
        insertIndex++;
      }

      // Insert new highlights after this position
      const result = [
        ...currentDisplayHighlights.slice(0, insertIndex + 1),
        ...newBookHighlights,
        ...currentDisplayHighlights.slice(insertIndex + 1)
      ];

      if (isSearchMode) {
        searchResults = result;
      } else {
        highlights = result;
      }

      isLoading = false;
      render();
    } else if (message.type === 'startLoading') {
      isLoading = true;
      render();
    } else if (message.type === 'stopLoading') {
      isLoading = false;
      render();
    }
  });

  function groupByBook(highlights) {
    // Group only ADJACENT highlights from the same source
    const groups = [];
    let currentSource = null;
    let currentGroup = null;

    highlights.forEach(h => {
      const source = h.source_author
        ? `${h.source_title} by ${h.source_author}`
        : h.source_title || 'Unknown';

      if (source !== currentSource) {
        // Start a new group
        if (currentGroup) {
          groups.push(currentGroup);
        }
        currentSource = source;
        currentGroup = {
          source: source,
          highlights: [h]
        };
      } else {
        // Add to current group
        currentGroup.highlights.push(h);
      }
    });

    // Add the last group
    if (currentGroup) {
      groups.push(currentGroup);
    }

    return groups;
  }

  function truncateText(text, maxLength = 80) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + '...';
  }

  function getSource(highlight) {
    return highlight.source_author
      ? `${highlight.source_title} by ${highlight.source_author}`
      : highlight.source_title || 'Unknown';
  }

  function findNextGroupStart(displayHighlights, currentIndex) {
    if (currentIndex >= displayHighlights.length - 1) return currentIndex;

    const currentSource = getSource(displayHighlights[currentIndex]);

    // Skip to end of current group
    let i = currentIndex + 1;
    while (i < displayHighlights.length && getSource(displayHighlights[i]) === currentSource) {
      i++;
    }

    return i < displayHighlights.length ? i : currentIndex;
  }

  function findPreviousGroupStart(displayHighlights, currentIndex) {
    if (currentIndex <= 0) return 0;

    const currentSource = getSource(displayHighlights[currentIndex]);

    // If we're not at the start of current group, go to start of current group
    let i = currentIndex - 1;
    if (i >= 0 && getSource(displayHighlights[i]) === currentSource) {
      // Go to start of current group
      while (i > 0 && getSource(displayHighlights[i - 1]) === currentSource) {
        i--;
      }
      return i;
    }

    // We're at start of current group, go to start of previous group
    while (i > 0 && getSource(displayHighlights[i]) !== currentSource) {
      i--;
    }

    // Now find the start of this group
    while (i > 0 && getSource(displayHighlights[i - 1]) === getSource(displayHighlights[i])) {
      i--;
    }

    return i;
  }

  function render() {
    const listContainer = document.getElementById('highlights-list');
    const detailsContainer = document.getElementById('details-container');

    // Show search input only when explicitly requested (via '/')
    const searchUI = document.getElementById('search-ui');
    if (isShowingSearchInput) {
      searchUI.style.display = 'block';
    } else {
      searchUI.style.display = 'none';
    }

    const displayHighlights = isSearchMode ? searchResults : highlights;

    if (displayHighlights.length === 0 && !isLoading) {
      const emptyMessage = isSearchMode ? 'No search results' : 'No highlights to review';
      listContainer.innerHTML = `<div class="empty-state">${emptyMessage}</div>`;
      detailsContainer.innerHTML = '';
      return;
    }

    // Group highlights by book
    const groupedHighlights = groupByBook(displayHighlights);

    // Render left pane (compact list)
    let listHTML = '';
    let itemIndex = 0;

    for (const group of groupedHighlights) {
      listHTML += `<div class="book-header">${group.source}</div>`;

      group.highlights.forEach(h => {
        const isFocused = h.id === selectedId;
        const isChecked = checkedIds.has(h.id);
        const checkbox = isChecked ? '☑' : '☐';
        const truncatedText = truncateText(h.text);

        listHTML += `
          <div class="highlight-item ${isFocused ? 'focused' : ''} ${isChecked ? 'checked' : ''}" data-id="${h.id}">
            <span class="checkbox">${checkbox}</span>${truncatedText}
          </div>
        `;
        itemIndex++;
      });
    }

    if (isLoading) {
      listHTML += `<div class="loading-indicator"><span class="spinner">⟳</span>Fetching highlights...</div>`;
    }

    if (hasReachedEnd && displayHighlights.length > 0) {
      listHTML += `<div class="end-of-list">— End of highlights —</div>`;
    }

    listContainer.innerHTML = listHTML;

    // Scroll focused into view in left pane
    const focusedEl = listContainer.querySelector('.focused');
    if (focusedEl) {
      focusedEl.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }

    // Render right pane (detail view)
    renderDetails(displayHighlights);
  }

  function renderDetails(displayHighlights) {
    const detailsContainer = document.getElementById('details-container');

    // Always show checked highlights, plus focused highlight at the bottom
    const checkedHighlights = displayHighlights.filter(h => checkedIds.has(h.id));
    const focusedHighlight = displayHighlights.find(h => h.id === selectedId);

    let detailHTML = '';

    // Render checked highlights first
    if (checkedHighlights.length > 0) {
      detailHTML += checkedHighlights.map(h => {
        const source = h.source_author
          ? `${h.source_title} by ${h.source_author}`
          : h.source_title || 'Unknown';
        const date = h.highlighted_at
          ? new Date(h.highlighted_at).toLocaleDateString()
          : '';
        const snoozeCount = h.snooze_count > 0 ? `(Snoozed ${h.snooze_count}x)` : '';

        return `
          <div class="highlight-detail checked">
            <div class="highlight-header">
              <div class="highlight-source">
                ${source} ${snoozeCount}
              </div>
              <div class="highlight-date">${date}</div>
            </div>
            <div class="highlight-text">${h.text}</div>
          </div>
        `;
      }).join('');
    }

    // Render focused highlight at the bottom (if not already checked)
    if (focusedHighlight && !checkedIds.has(focusedHighlight.id)) {
      const source = focusedHighlight.source_author
        ? `${focusedHighlight.source_title} by ${focusedHighlight.source_author}`
        : focusedHighlight.source_title || 'Unknown';
      const date = focusedHighlight.highlighted_at
        ? new Date(focusedHighlight.highlighted_at).toLocaleDateString()
        : '';
      const snoozeCount = focusedHighlight.snooze_count > 0 ? `(Snoozed ${focusedHighlight.snooze_count}x)` : '';

      detailHTML += `
        <div class="highlight-detail focused-only" id="focused-detail">
          <div class="highlight-header">
            <div class="highlight-source">
              ${source} ${snoozeCount}
            </div>
            <div class="highlight-date">${date}</div>
          </div>
          <div class="highlight-text">${focusedHighlight.text}</div>
        </div>
      `;
    }

    if (detailHTML === '') {
      detailsContainer.innerHTML = '<div class="empty-state">No highlight selected</div>';
      return;
    }

    detailsContainer.innerHTML = detailHTML;

    // Scroll focused highlight into view
    const focusedDetailEl = document.getElementById('focused-detail');
    if (focusedDetailEl) {
      focusedDetailEl.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
  }

  // Keyboard handlers organized by functionality
  const keyboardHandlers = {
    '/': (e, displayHighlights) => {
      e.preventDefault();
      isSearchMode = true;
      isShowingSearchInput = true;
      render();
      setTimeout(() => {
        const searchInput = document.getElementById('search-input');
        if (searchInput) searchInput.focus();
      }, 0);
    },

    'e': (e, displayHighlights) => {
      e.preventDefault();

      if (e.shiftKey) {
        // Shift+E: Fetch all highlights from the focused highlight's book
        const focusedHighlight = displayHighlights.find(h => h.id === selectedId);
        if (!focusedHighlight) return;

        isLoading = true;
        render();

        vscode.postMessage({
          type: 'fetchBookHighlights',
          bookId: focusedHighlight.book_id
        });
      } else {
        // E: Search for similar highlights
        const currentIndex = getSelectedIndex(displayHighlights);
        const highlightsToSearch = checkedIds.size > 0
          ? displayHighlights.filter(h => checkedIds.has(h.id))
          : [displayHighlights[currentIndex]];

        // Immediately show only selected highlights + loading spinner
        isSearchMode = true;
        isShowingSearchInput = false;
        searchResults = highlightsToSearch;
        isLoading = true;
        render();

        const combinedText = highlightsToSearch.map(h => h.text).join('\n\n');
        vscode.postMessage({
          type: 'searchSimilar',
          query: combinedText
        });
      }
    },

    'Escape': (e, displayHighlights) => {
      e.preventDefault();
      if (isSearchMode) {
        isSearchMode = false;
        isShowingSearchInput = false;
        searchResults = [];
      }
      checkedIds.clear();
      render();
    },

    'ArrowUp': (e, displayHighlights) => {
      e.preventDefault();
      if (e.metaKey) {
        // Cmd+Up: Jump to first highlight
        selectedId = displayHighlights[0]?.id;
      } else if (e.altKey) {
        // Opt+Up: Jump to previous group
        const currentIndex = getSelectedIndex(displayHighlights);
        const newIndex = findPreviousGroupStart(displayHighlights, currentIndex);
        selectedId = displayHighlights[newIndex]?.id;
      } else {
        // Normal up: Move up one
        const currentIndex = getSelectedIndex(displayHighlights);
        const newIndex = Math.max(0, currentIndex - 1);
        selectedId = displayHighlights[newIndex]?.id;
      }
      render();
    },

    'ArrowDown': (e, displayHighlights) => {
      e.preventDefault();
      if (e.metaKey) {
        // Cmd+Down: Jump to last highlight
        selectedId = displayHighlights[displayHighlights.length - 1]?.id;
      } else if (e.altKey) {
        // Opt+Down: Jump to next group
        const currentIndex = getSelectedIndex(displayHighlights);
        const newIndex = findNextGroupStart(displayHighlights, currentIndex);
        selectedId = displayHighlights[newIndex]?.id;
      } else {
        // Normal down: Move down one
        const currentIndex = getSelectedIndex(displayHighlights);
        const newIndex = Math.min(displayHighlights.length - 1, currentIndex + 1);
        selectedId = displayHighlights[newIndex]?.id;
        checkLoadMore();
      }
      render();
    },

    ' ': (e, displayHighlights) => {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+Space: Toggle all highlights in current group
        const currentHighlight = displayHighlights.find(h => h.id === selectedId);
        if (currentHighlight) {
          const currentIndex = displayHighlights.findIndex(h => h.id === selectedId);
          const currentSource = getSource(currentHighlight);

          // Find the adjacent group
          const groupHighlights = [currentHighlight];

          // Look backwards
          for (let i = currentIndex - 1; i >= 0; i--) {
            const h = displayHighlights[i];
            if (getSource(h) === currentSource) {
              groupHighlights.unshift(h);
            } else {
              break;
            }
          }

          // Look forwards
          for (let i = currentIndex + 1; i < displayHighlights.length; i++) {
            const h = displayHighlights[i];
            if (getSource(h) === currentSource) {
              groupHighlights.push(h);
            } else {
              break;
            }
          }

          // Toggle all
          const allChecked = groupHighlights.every(h => checkedIds.has(h.id));
          if (allChecked) {
            groupHighlights.forEach(h => checkedIds.delete(h.id));
          } else {
            groupHighlights.forEach(h => checkedIds.add(h.id));
          }
        }
      } else {
        // Space: Toggle individual highlight
        if (selectedId) {
          if (checkedIds.has(selectedId)) {
            checkedIds.delete(selectedId);
          } else {
            checkedIds.add(selectedId);
          }
        }
      }
      render();
    },

    'Enter': (e, displayHighlights) => {
      e.preventDefault();
      const idsToIntegrate = checkedIds.size > 0
        ? Array.from(checkedIds)
        : (selectedId ? [selectedId] : []);

      if (idsToIntegrate.length > 0) {
        vscode.postMessage({
          type: 'integrate',
          highlightIds: idsToIntegrate
        });
      }
    },

    's': (e, displayHighlights) => {
      e.preventDefault();
      const idsToSnooze = checkedIds.size > 0
        ? Array.from(checkedIds)
        : (selectedId ? [selectedId] : []);

      if (idsToSnooze.length > 0) {
        // Find next valid highlight
        const currentIndex = getSelectedIndex(displayHighlights);
        let nextIndex = currentIndex;

        while (nextIndex < displayHighlights.length && idsToSnooze.includes(displayHighlights[nextIndex].id)) {
          nextIndex++;
        }

        if (nextIndex >= displayHighlights.length) {
          nextIndex = currentIndex - 1;
          while (nextIndex >= 0 && idsToSnooze.includes(displayHighlights[nextIndex].id)) {
            nextIndex--;
          }
        }

        selectedId = nextIndex >= 0 && nextIndex < displayHighlights.length
          ? displayHighlights[nextIndex].id
          : null;

        vscode.postMessage({
          type: 'snooze',
          highlightIds: idsToSnooze
        });
        checkedIds.clear();
      }
    },

    'Backspace': (e, displayHighlights) => {
      e.preventDefault();
      const idsToArchive = checkedIds.size > 0
        ? Array.from(checkedIds)
        : (selectedId ? [selectedId] : []);

      if (idsToArchive.length > 0) {
        // Find next valid highlight
        const currentIndex = getSelectedIndex(displayHighlights);
        let nextIndex = currentIndex;

        while (nextIndex < displayHighlights.length && idsToArchive.includes(displayHighlights[nextIndex].id)) {
          nextIndex++;
        }

        if (nextIndex >= displayHighlights.length) {
          nextIndex = currentIndex - 1;
          while (nextIndex >= 0 && idsToArchive.includes(displayHighlights[nextIndex].id)) {
            nextIndex--;
          }
        }

        selectedId = nextIndex >= 0 && nextIndex < displayHighlights.length
          ? displayHighlights[nextIndex].id
          : null;

        vscode.postMessage({
          type: 'archive',
          highlightIds: idsToArchive
        });
        checkedIds.clear();
      }
    },

    'o': (e, displayHighlights) => {
      e.preventDefault();
      const focusedHighlight = displayHighlights.find(h => h.id === selectedId);
      if (focusedHighlight && focusedHighlight.unique_url) {
        vscode.postMessage({
          type: 'openUrl',
          url: focusedHighlight.unique_url
        });
      }
    }
  };

  // Keyboard navigation
  document.addEventListener('keydown', e => {
    const displayHighlights = isSearchMode ? searchResults : highlights;

    // Handle search input focus
    const searchInput = document.getElementById('search-input');
    if (searchInput && document.activeElement === searchInput) {
      if (e.key === 'Escape') {
        e.preventDefault();
        searchInput.blur();
        isSearchMode = false;
        isShowingSearchInput = false;
        searchResults = [];
        render();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const query = searchInput.value;
        if (query) {
          vscode.postMessage({
            type: 'search',
            query: query
          });
        }
      }
      return;
    }

    if (displayHighlights.length === 0) return;

    // Dispatch to appropriate handler
    const key = e.key.toLowerCase();
    const handler = keyboardHandlers[e.key] || keyboardHandlers[key];

    if (handler) {
      handler(e, displayHighlights);
    }
  });

  // Click handler for highlights
  document.addEventListener('click', e => {
    const highlightEl = e.target.closest('.highlight-item');
    if (highlightEl) {
      const id = highlightEl.dataset.id;
      if (id) {
        selectedId = id;

        if (checkedIds.has(id)) {
          checkedIds.delete(id);
        } else {
          checkedIds.add(id);
        }

        render();
      }
    }
  });

})();
