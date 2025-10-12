(function() {
  const vscode = acquireVsCodeApi();
  let highlights = [];
  let selectedIndex = 0;
  let expandedIds = new Set();
  let checkedIds = new Set();
  let isSearchMode = false;
  let searchResults = [];
  let isLoading = false;

  window.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'updateHighlights') {
      highlights = message.highlights;
      // Reset selection if out of bounds
      if (selectedIndex >= highlights.length) {
        selectedIndex = Math.max(0, highlights.length - 1);
      }
      render();
    } else if (message.type === 'searchResults') {
      // Sort: checked highlights first, then new search results
      const newResults = message.highlights;
      const checkedResults = newResults.filter(h => checkedIds.has(h.id));
      const uncheckedResults = newResults.filter(h => !checkedIds.has(h.id));
      searchResults = [...checkedResults, ...uncheckedResults];

      isSearchMode = true;

      // Set focus to first unchecked highlight
      selectedIndex = checkedResults.length;

      render();
    } else if (message.type === 'startLoading') {
      isLoading = true;
      render();
    } else if (message.type === 'stopLoading') {
      isLoading = false;
      render();
    }
  });

  function render() {
    const container = document.getElementById('highlights-container');

    // Show search input if in search mode
    const searchUI = document.getElementById('search-ui');
    if (isSearchMode) {
      searchUI.style.display = 'block';
    } else {
      searchUI.style.display = 'none';
    }

    const displayHighlights = isSearchMode ? searchResults : highlights;

    // Create loading placeholder if loading
    const loadingItem = isLoading ? `
      <div class="highlight loading-placeholder">
        <div class="highlight-header">
          <div class="highlight-source">
            <span class="spinner">⟳</span>
            Fetching new highlights from Readwise...
          </div>
        </div>
      </div>
    ` : '';

    if (displayHighlights.length === 0 && !isLoading) {
      const emptyMessage = isSearchMode ? 'No search results' : 'No highlights to review';
      container.innerHTML = `<div class="empty-state">${emptyMessage}</div>`;
      return;
    }

    const highlightItems = displayHighlights.map((h, i) => {
      const isFocused = i === selectedIndex && !isLoading; // Don't focus if loading placeholder at top
      const isExpanded = expandedIds.has(h.id) || isFocused; // Expand if focused
      const isChecked = checkedIds.has(h.id);
      const source = h.source_author
        ? `${h.source_title} by ${h.source_author}`
        : h.source_title || 'Unknown';
      const date = h.highlighted_at
        ? new Date(h.highlighted_at).toLocaleDateString()
        : '';
      const snoozeCount = h.snooze_count > 0 ? `(Snoozed ${h.snooze_count}x)` : '';

      return `
        <div class="highlight ${isFocused ? 'focused' : ''} ${isChecked ? 'checked' : ''}" data-index="${i}">
          <div class="highlight-header">
            <div class="highlight-source">
              <span class="checkbox">${isChecked ? '☑' : '☐'}</span>
              ${source} ${snoozeCount}
            </div>
            <div class="highlight-date">${date}</div>
          </div>
          <div class="highlight-text ${isExpanded ? '' : 'collapsed'}">
            ${h.text}
          </div>
        </div>
      `;
    }).join('');

    // Combine loading placeholder at top with highlights
    container.innerHTML = loadingItem + highlightItems;

    // Scroll focused into view
    const focusedEl = container.querySelector('.focused');
    if (focusedEl) {
      focusedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

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

    switch(e.key) {
      case '/':
        e.preventDefault();
        isSearchMode = true;
        render();
        setTimeout(() => {
          const searchInput = document.getElementById('search-input');
          if (searchInput) searchInput.focus();
        }, 0);
        break;
      case 'e':
      case 'E':
        e.preventDefault();
        // Get checked highlights or just focused one
        const highlightsToSearch = checkedIds.size > 0
          ? displayHighlights.filter(h => checkedIds.has(h.id))
          : [displayHighlights[selectedIndex]];

        const combinedText = highlightsToSearch.map(h => h.text).join('\n\n');
        vscode.postMessage({
          type: 'searchSimilar',
          query: combinedText
        });
        break;
      case 'Escape':
        if (isSearchMode) {
          e.preventDefault();
          isSearchMode = false;
          searchResults = [];
          render();
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        selectedIndex = Math.max(0, selectedIndex - 1);
        render();
        break;
      case 'ArrowDown':
        e.preventDefault();
        selectedIndex = Math.min(displayHighlights.length - 1, selectedIndex + 1);
        render();
        break;
      case ' ':
        e.preventDefault();
        const currentHighlight = displayHighlights[selectedIndex];
        const currentSource = currentHighlight.source_title;
        const highlightsFromSource = displayHighlights.filter(h => h.source_title === currentSource);
        if (e.shiftKey) {
          // Shift+Space toggles ALL highlights from the same source
          const currentHighlight = displayHighlights[selectedIndex];
          const currentSource = currentHighlight.source_title;
          const highlightsFromSource = displayHighlights.filter(h => h.source_title === currentSource);
          console.log('Toggling all highlights from source:', currentSource, 'count:', highlightsFromSource.length);

          // Check if all highlights from this source are already checked
          const allChecked = highlightsFromSource.every(h => checkedIds.has(h.id));

          if (allChecked) {
            // Uncheck and collapse all from this source
            highlightsFromSource.forEach(h => {
              checkedIds.delete(h.id);
              expandedIds.delete(h.id);
            });
          } else {
            // Check and expand all from this source
            highlightsFromSource.forEach(h => {
              checkedIds.add(h.id);
              expandedIds.add(h.id);
            });
          }
        } else {
          // Space toggles individual highlight
          const id = displayHighlights[selectedIndex].id;
          console.log('Toggling individual highlight:', id);
          if (checkedIds.has(id)) {
            checkedIds.delete(id);
            expandedIds.delete(id);
          } else {
            checkedIds.add(id);
            expandedIds.add(id);
          }
        }
        render();
        break;
      case 'Enter':
        e.preventDefault();
        // Integrate all checked highlights (or just focused one if none checked)
        const idsToIntegrate = checkedIds.size > 0
          ? Array.from(checkedIds)
          : [displayHighlights[selectedIndex].id];

        vscode.postMessage({
          type: 'integrate',
          highlightIds: idsToIntegrate
        });
        // Clear checked after integrating
        checkedIds.clear();
        break;
      case 's':
      case 'S':
        e.preventDefault();
        // Snooze all checked highlights (or just focused one if none checked)
        const idsToSnooze = checkedIds.size > 0
          ? Array.from(checkedIds)
          : [displayHighlights[selectedIndex].id];

        vscode.postMessage({
          type: 'snooze',
          highlightIds: idsToSnooze
        });
        // Clear checked after snoozing
        checkedIds.clear();
        break;
      case 'Backspace':
        e.preventDefault();
        // Archive all checked highlights (or just focused one if none checked)
        const idsToArchive = checkedIds.size > 0
          ? Array.from(checkedIds)
          : [displayHighlights[selectedIndex].id];

        vscode.postMessage({
          type: 'archive',
          highlightIds: idsToArchive
        });
        // Clear checked after archiving
        checkedIds.clear();
        break;
      case 'o':
      case 'O':
        e.preventDefault();
        // Open Readwise source for the focused highlight
        const focusedHighlight = displayHighlights[selectedIndex];
        if (focusedHighlight && focusedHighlight.book_id) {
          const readwiseUrl = `wiseread:///read/${focusedHighlight.book_id}`;
          vscode.postMessage({
            type: 'openUrl',
            url: readwiseUrl
          });
        }
        break;
    }
  });

  // Click handler for highlights
  document.addEventListener('click', e => {
    const highlightEl = e.target.closest('.highlight');
    if (highlightEl) {
      const index = parseInt(highlightEl.dataset.index);
      if (!isNaN(index) && index >= 0 && index < displayHighlights.length) {
        const id = displayHighlights[index].id;

        // Toggle checkbox
        if (checkedIds.has(id)) {
          checkedIds.delete(id);
          expandedIds.delete(id);
        } else {
          checkedIds.add(id);
          expandedIds.add(id);
        }

        render();
      }
    }
  });

  // Button handlers
  document.getElementById('snooze-all').addEventListener('click', () => {
    vscode.postMessage({ type: 'snoozeAll' });
  });

  document.getElementById('archive-all').addEventListener('click', () => {
    vscode.postMessage({ type: 'archiveAll' });
  });
})();
