(function() {
  const vscode = acquireVsCodeApi();
  let highlights = [];
  let selectedId = null; // Track by ID instead of index
  let checkedIds = new Set();
  let isSearchMode = false;
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
      // Sort: checked highlights first, then new search results
      const newResults = message.highlights;
      const checkedResults = newResults.filter(h => checkedIds.has(h.id));
      const uncheckedResults = newResults.filter(h => !checkedIds.has(h.id));
      searchResults = [...checkedResults, ...uncheckedResults];

      isSearchMode = true;

      // Set focus to first unchecked highlight
      const firstUncheckedIndex = checkedResults.length;
      selectedId = searchResults[firstUncheckedIndex]?.id || (searchResults.length > 0 ? searchResults[0].id : null);

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

  function render() {
    const listContainer = document.getElementById('highlights-list');
    const detailsContainer = document.getElementById('details-container');

    // Show search input if in search mode
    const searchUI = document.getElementById('search-ui');
    if (isSearchMode) {
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

    if (isLoading) {
      listHTML += `<div class="loading-indicator"><span class="spinner">⟳</span>Fetching highlights...</div>`;
    }

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

    if (hasReachedEnd && displayHighlights.length > 0) {
      listHTML += `<div class="end-of-list">— End of highlights —</div>`;
    }

    listHTML += `<div class="keyboard-hints">↑↓: Navigate • Space: Check • Enter: Integrate • S: Snooze • Backspace: Archive • O: Open • /: Search • E: Similar</div>`;

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
        const currentUpIndex = getSelectedIndex(displayHighlights);
        const newUpIndex = Math.max(0, currentUpIndex - 1);
        selectedId = displayHighlights[newUpIndex]?.id;
        render();
        break;
      case 'ArrowDown':
        e.preventDefault();
        const currentDownIndex = getSelectedIndex(displayHighlights);
        const newDownIndex = Math.min(displayHighlights.length - 1, currentDownIndex + 1);
        selectedId = displayHighlights[newDownIndex]?.id;
        checkLoadMore();
        render();
        break;
      case ' ':
        e.preventDefault();
        if (e.shiftKey) {
          // Shift+Space toggles highlights in the current ADJACENT group only
          const currentHighlight = displayHighlights.find(h => h.id === selectedId);
          if (currentHighlight) {
            const currentIndex = displayHighlights.findIndex(h => h.id === selectedId);
            const currentSource = currentHighlight.source_author
              ? `${currentHighlight.source_title} by ${currentHighlight.source_author}`
              : currentHighlight.source_title || 'Unknown';

            // Find the adjacent group by looking backwards and forwards from current index
            const groupHighlights = [currentHighlight];

            // Look backwards
            for (let i = currentIndex - 1; i >= 0; i--) {
              const h = displayHighlights[i];
              const source = h.source_author
                ? `${h.source_title} by ${h.source_author}`
                : h.source_title || 'Unknown';
              if (source === currentSource) {
                groupHighlights.unshift(h);
              } else {
                break;
              }
            }

            // Look forwards
            for (let i = currentIndex + 1; i < displayHighlights.length; i++) {
              const h = displayHighlights[i];
              const source = h.source_author
                ? `${h.source_title} by ${h.source_author}`
                : h.source_title || 'Unknown';
              if (source === currentSource) {
                groupHighlights.push(h);
              } else {
                break;
              }
            }

            // Check if all highlights in this group are already checked
            const allChecked = groupHighlights.every(h => checkedIds.has(h.id));

            if (allChecked) {
              // Uncheck all in this group
              groupHighlights.forEach(h => {
                checkedIds.delete(h.id);
              });
            } else {
              // Check all in this group
              groupHighlights.forEach(h => {
                checkedIds.add(h.id);
              });
            }
          }
        } else {
          // Space toggles individual highlight
          if (selectedId) {
            if (checkedIds.has(selectedId)) {
              checkedIds.delete(selectedId);
            } else {
              checkedIds.add(selectedId);
            }
          }
        }
        render();
        break;
      case 'Enter':
        e.preventDefault();
        // Integrate all checked highlights (or just focused one if none checked)
        const idsToIntegrate = checkedIds.size > 0
          ? Array.from(checkedIds)
          : (selectedId ? [selectedId] : []);

        if (idsToIntegrate.length > 0) {
          vscode.postMessage({
            type: 'integrate',
            highlightIds: idsToIntegrate
          });
          // Clear checked after integrating
          checkedIds.clear();
        }
        break;
      case 's':
      case 'S':
        e.preventDefault();
        // Snooze all checked highlights (or just focused one if none checked)
        const idsToSnooze = checkedIds.size > 0
          ? Array.from(checkedIds)
          : (selectedId ? [selectedId] : []);

        if (idsToSnooze.length > 0) {
          vscode.postMessage({
            type: 'snooze',
            highlightIds: idsToSnooze
          });
          // Clear checked after snoozing
          checkedIds.clear();
        }
        break;
      case 'Backspace':
        e.preventDefault();
        // Archive all checked highlights (or just focused one if none checked)
        const idsToArchive = checkedIds.size > 0
          ? Array.from(checkedIds)
          : (selectedId ? [selectedId] : []);

        if (idsToArchive.length > 0) {
          vscode.postMessage({
            type: 'archive',
            highlightIds: idsToArchive
          });
          // Clear checked after archiving
          checkedIds.clear();
        }
        break;
      case 'o':
      case 'O':
        e.preventDefault();
        // Open Readwise source for the focused highlight
        const focusedHighlight = displayHighlights.find(h => h.id === selectedId);
        if (focusedHighlight && focusedHighlight.unique_url) {
          vscode.postMessage({
            type: 'openUrl',
            url: focusedHighlight.unique_url
          });
        }
        break;
    }
  });

  // Click handler for highlights
  document.addEventListener('click', e => {
    const highlightEl = e.target.closest('.highlight-item');
    if (highlightEl) {
      const id = highlightEl.dataset.id;
      if (id) {
        // Set selection to clicked item
        selectedId = id;

        // Toggle checkbox
        if (checkedIds.has(id)) {
          checkedIds.delete(id);
        } else {
          checkedIds.add(id);
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
