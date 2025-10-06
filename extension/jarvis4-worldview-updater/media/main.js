(function() {
  const vscode = acquireVsCodeApi();
  let highlights = [];
  let selectedIndex = 0;
  let expandedIds = new Set();
  let checkedIds = new Set();

  window.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'updateHighlights') {
      highlights = message.highlights;
      // Reset selection if out of bounds
      if (selectedIndex >= highlights.length) {
        selectedIndex = Math.max(0, highlights.length - 1);
      }
      render();
    }
  });

  function render() {
    const container = document.getElementById('highlights-container');

    if (highlights.length === 0) {
      container.innerHTML = '<div class="empty-state">No highlights to review</div>';
      return;
    }

    container.innerHTML = highlights.map((h, i) => {
      const isFocused = i === selectedIndex;
      const isExpanded = expandedIds.has(h.id);
      const isChecked = checkedIds.has(h.id);
      const preview = h.text.slice(0, 100) + (h.text.length > 100 ? '...' : '');
      const fullText = h.text;
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
          <div class="highlight-text">
            ${isExpanded ? fullText : preview}
          </div>
        </div>
      `;
    }).join('');

    // Scroll focused into view
    const focusedEl = container.querySelector('.focused');
    if (focusedEl) {
      focusedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  // Keyboard navigation
  document.addEventListener('keydown', e => {
    if (highlights.length === 0) return;

    switch(e.key) {
      case 'ArrowUp':
        e.preventDefault();
        selectedIndex = Math.max(0, selectedIndex - 1);
        render();
        break;
      case 'ArrowDown':
        e.preventDefault();
        selectedIndex = Math.min(highlights.length - 1, selectedIndex + 1);
        render();
        break;
      case ' ':
        e.preventDefault();
        const id = highlights[selectedIndex].id;
        // Toggle checked state
        if (checkedIds.has(id)) {
          checkedIds.delete(id);
        } else {
          checkedIds.add(id);
        }
        render();
        break;
      case 'x':
      case 'X':
        e.preventDefault();
        // Expand/collapse focused highlight
        const expandId = highlights[selectedIndex].id;
        if (expandedIds.has(expandId)) {
          expandedIds.delete(expandId);
        } else {
          expandedIds.add(expandId);
        }
        render();
        break;
      case 'Enter':
        e.preventDefault();
        // Integrate all checked highlights (or just focused one if none checked)
        const idsToIntegrate = checkedIds.size > 0
          ? Array.from(checkedIds)
          : [highlights[selectedIndex].id];

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
        vscode.postMessage({
          type: 'snooze',
          highlightId: highlights[selectedIndex].id
        });
        break;
      case 'Backspace':
        e.preventDefault();
        vscode.postMessage({
          type: 'archive',
          highlightId: highlights[selectedIndex].id
        });
        break;
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
