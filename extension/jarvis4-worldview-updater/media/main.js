(function() {
  const vscode = acquireVsCodeApi();
  let highlights = [];
  let selectedIndex = 0;
  let expandedIds = new Set();

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
      const isSelected = i === selectedIndex;
      const isExpanded = expandedIds.has(h.id);
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
        <div class="highlight ${isSelected ? 'selected' : ''}" data-index="${i}">
          <div class="highlight-header">
            <div class="highlight-source">${source} ${snoozeCount}</div>
            <div class="highlight-date">${date}</div>
          </div>
          <div class="highlight-text">
            ${isExpanded ? fullText : preview}
          </div>
        </div>
      `;
    }).join('');

    // Scroll selected into view
    const selectedEl = container.querySelector('.selected');
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
        if (expandedIds.has(id)) {
          expandedIds.delete(id);
        } else {
          expandedIds.add(id);
        }
        render();
        break;
      case 'Enter':
        e.preventDefault();
        vscode.postMessage({
          type: 'integrate',
          highlightId: highlights[selectedIndex].id
        });
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
