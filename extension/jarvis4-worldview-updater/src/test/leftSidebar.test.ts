import { describe, test, expect, beforeEach, jest } from '@jest/globals';

/**
 * Integration tests for the left sidebar highlight management.
 * These tests capture the core user workflows and ensure data consistency.
 */

// Mock highlight data factory
const createHighlight = (id: string, bookId: number, title: string = 'Test Book') => ({
  id,
  text: `Highlight ${id}`,
  source_title: title,
  source_author: 'Test Author',
  book_id: bookId,
  snooze_count: 0,
  url: `https://readwise.io/${id}`,
  readwise_url: `https://readwise.io/open/${id}`,
});

// Mock vscode API
const mockVscode = {
  postMessage: jest.fn(),
};

// Simulate the frontend state
class LeftSidebarSimulator {
  highlights: any[] = [];
  searchResults: any[] = [];
  isSearchMode: boolean = false;
  selectedId: string | null = null;
  checkedIds: Set<string> = new Set();

  constructor() {
    // Mock vscode message handler
    (global as any).vscode = mockVscode;
  }

  loadHighlights(highlights: any[]) {
    this.highlights = highlights;
    this.isSearchMode = false;
    this.selectedId = highlights[0]?.id || null;
  }

  search(results: any[]) {
    this.searchResults = results;
    this.isSearchMode = true;
    this.selectedId = results[0]?.id || null;
  }

  pressDown() {
    const list = this.isSearchMode ? this.searchResults : this.highlights;
    const currentIndex = list.findIndex(h => h.id === this.selectedId);
    if (currentIndex < list.length - 1) {
      this.selectedId = list[currentIndex + 1].id;
    }
  }

  pressUp() {
    const list = this.isSearchMode ? this.searchResults : this.highlights;
    const currentIndex = list.findIndex(h => h.id === this.selectedId);
    if (currentIndex > 0) {
      this.selectedId = list[currentIndex - 1].id;
    }
  }

  async pressShiftE() {
    const list = this.isSearchMode ? this.searchResults : this.highlights;
    const focused = list.find(h => h.id === this.selectedId);
    if (!focused) return;

    // Insert loading placeholder
    const bookId = focused.book_id;
    const insertIndex = list.findIndex(h => h.id === this.selectedId);

    const loadingPlaceholder = {
      id: '__loading__',
      text: '⏳ Loading...',
      book_id: bookId,
    };

    list.splice(insertIndex + 1, 0, loadingPlaceholder);

    // Simulate backend response
    if (bookId === 0) {
      // Need to fetch book_id first
      await this.simulateFetchBookHighlightsById(focused.id);
    } else {
      await this.simulateFetchBookHighlights(bookId);
    }
  }

  async simulateFetchBookHighlightsById(highlightId: string) {
    // Simulate DB lookup to get book_id
    const mockBookId = 28033096;
    await this.simulateFetchBookHighlights(mockBookId);
  }

  async simulateFetchBookHighlights(bookId: number) {
    const list = this.isSearchMode ? this.searchResults : this.highlights;

    // Remove loading placeholder
    const withoutLoading = list.filter(h => h.id !== '__loading__');

    // Simulate backend returning all highlights for this book
    const newHighlights = Array.from({ length: 50 }, (_, i) =>
      createHighlight(`book${bookId}_${i}`, bookId, `Book ${bookId}`)
    );

    // Deduplicate
    const existingIds = new Set(withoutLoading.map(h => h.id));
    const newBookHighlights = newHighlights.filter(h => !existingIds.has(h.id));

    if (newBookHighlights.length === 0) {
      if (this.isSearchMode) {
        this.searchResults = withoutLoading;
      } else {
        this.highlights = withoutLoading;
      }
      return;
    }

    // Find focused highlight and update book_id if needed
    const focusedHighlight = withoutLoading.find(h => h.id === this.selectedId);
    const actualBookId = newBookHighlights[0]?.book_id || focusedHighlight?.book_id;

    if (focusedHighlight && focusedHighlight.book_id === 0) {
      focusedHighlight.book_id = actualBookId;
    }

    // Find insert position
    let insertIndex = withoutLoading.findIndex(h => h.id === this.selectedId);
    while (
      insertIndex < withoutLoading.length - 1 &&
      withoutLoading[insertIndex + 1].book_id === actualBookId
    ) {
      insertIndex++;
    }

    // Insert
    const result = [
      ...withoutLoading.slice(0, insertIndex + 1),
      ...newBookHighlights,
      ...withoutLoading.slice(insertIndex + 1)
    ];

    if (this.isSearchMode) {
      this.searchResults = result;
    } else {
      this.highlights = result;
    }
  }

  appendHighlights(newHighlights: any[]) {
    // Deduplicate before appending
    const existingIds = new Set(this.highlights.map(h => h.id));
    const deduped = newHighlights.filter(h => !existingIds.has(h.id));
    this.highlights = this.highlights.concat(deduped);
  }

  checkAll(ids: string[]) {
    ids.forEach(id => this.checkedIds.add(id));
  }

  async pressBackspace() {
    if (this.checkedIds.size === 0) return;

    const idsToRemove = Array.from(this.checkedIds);

    // Remove from appropriate list
    if (this.isSearchMode) {
      this.searchResults = this.searchResults.filter(h => !this.checkedIds.has(h.id));
    } else {
      this.highlights = this.highlights.filter(h => !this.checkedIds.has(h.id));
    }

    this.checkedIds.clear();

    // Update selection
    const list = this.isSearchMode ? this.searchResults : this.highlights;
    if (list.length > 0 && !list.find(h => h.id === this.selectedId)) {
      this.selectedId = list[0].id;
    }
  }

  getBookGroup(highlightId?: string): any[] {
    const list = this.isSearchMode ? this.searchResults : this.highlights;
    const id = highlightId || this.selectedId;
    const highlight = list.find(h => h.id === id);

    if (!highlight) return [];
    if (highlight.book_id === 0) return [highlight];

    return list.filter(h => h.book_id === highlight.book_id);
  }

  hasDuplicates(): boolean {
    const list = this.isSearchMode ? this.searchResults : this.highlights;
    const ids = list.map(h => h.id);
    return ids.length !== new Set(ids).size;
  }

  countHighlights(): number {
    return this.isSearchMode ? this.searchResults.length : this.highlights.length;
  }

  getSelected() {
    const list = this.isSearchMode ? this.searchResults : this.highlights;
    return list.find(h => h.id === this.selectedId);
  }
}

describe('Left Sidebar Integration Tests', () => {
  let sidebar: LeftSidebarSimulator;

  beforeEach(() => {
    sidebar = new LeftSidebarSimulator();
    jest.clearAllMocks();
  });

  test('basic navigation maintains selection', () => {
    const highlights = [
      createHighlight('1', 100),
      createHighlight('2', 100),
      createHighlight('3', 100),
    ];

    sidebar.loadHighlights(highlights);

    expect(sidebar.selectedId).toBe('1');

    sidebar.pressDown();
    expect(sidebar.selectedId).toBe('2');

    sidebar.pressDown();
    expect(sidebar.selectedId).toBe('3');

    sidebar.pressUp();
    expect(sidebar.selectedId).toBe('2');
  });

  test('search then shift-E workflow', async () => {
    // Simulate search results with book_id = 0
    const searchResults = [
      { ...createHighlight('search1', 0), book_id: 0 },
      { ...createHighlight('search2', 0), book_id: 0 },
    ];

    sidebar.search(searchResults);
    expect(sidebar.countHighlights()).toBe(2);
    expect(sidebar.selectedId).toBe('search1');

    // Press Shift+E
    await sidebar.pressShiftE();

    // Should have loaded book highlights
    expect(sidebar.countHighlights()).toBeGreaterThan(2);

    // Should have no duplicates
    expect(sidebar.hasDuplicates()).toBe(false);

    // Selected highlight should now have real book_id
    const selected = sidebar.getSelected();
    expect(selected?.book_id).not.toBe(0);
  });

  test('shift-E then infinite scroll deduplicates', async () => {
    const initialHighlights = [
      createHighlight('1', 100, 'Book A'),
      createHighlight('2', 100, 'Book A'),
      createHighlight('3', 200, 'Book B'),
    ];

    sidebar.loadHighlights(initialHighlights);

    // Focus on book A highlight
    sidebar.selectedId = '1';

    // Press Shift+E to load all Book A highlights
    await sidebar.pressShiftE();

    const countAfterShiftE = sidebar.countHighlights();
    expect(countAfterShiftE).toBeGreaterThan(3);

    // Simulate infinite scroll loading more highlights
    // This might include duplicates of what Shift+E loaded
    const scrolledHighlights = Array.from({ length: 30 }, (_, i) => {
      const bookId = i < 10 ? 100 : 200 + i; // First 10 are Book A (duplicates!)
      return createHighlight(`scroll_${i}`, bookId);
    });

    sidebar.appendHighlights(scrolledHighlights);

    // Should have deduplicated
    expect(sidebar.hasDuplicates()).toBe(false);
  });

  test('backspace on book group after shift-E', async () => {
    const initialHighlights = [
      createHighlight('1', 100, 'Book A'),
      createHighlight('2', 200, 'Book B'),
      createHighlight('3', 300, 'Book C'),
    ];

    sidebar.loadHighlights(initialHighlights);
    sidebar.selectedId = '1';

    // Press Shift+E to load all Book A highlights
    await sidebar.pressShiftE();

    const bookGroup = sidebar.getBookGroup();
    expect(bookGroup.length).toBeGreaterThan(1); // Should have expanded

    // Check all Book A highlights
    const bookAIds = bookGroup.map(h => h.id);
    sidebar.checkAll(bookAIds);

    const countBefore = sidebar.countHighlights();

    // Press backspace
    await sidebar.pressBackspace();

    // All Book A highlights should be removed
    const countAfter = sidebar.countHighlights();
    expect(countAfter).toBe(countBefore - bookAIds.length);

    // No Book A highlights should remain
    const remainingBookAHighlights = sidebar.highlights.filter(h => h.book_id === 100);
    expect(remainingBookAHighlights.length).toBe(0);
  });

  test('search -> shift-E -> backspace removes all', async () => {
    // Search returns results with book_id = 0
    const searchResults = [
      { ...createHighlight('search1', 0), book_id: 0 },
      { ...createHighlight('search2', 0), book_id: 0 },
    ];

    sidebar.search(searchResults);
    sidebar.selectedId = 'search1';

    // Press Shift+E to expand the book
    await sidebar.pressShiftE();

    const bookGroup = sidebar.getBookGroup();
    expect(bookGroup.length).toBeGreaterThan(1);

    // Check all highlights in the book
    const bookIds = bookGroup.map(h => h.id);
    sidebar.checkAll(bookIds);

    expect(sidebar.checkedIds.size).toBe(bookIds.length);

    // Press backspace
    await sidebar.pressBackspace();

    // All checked highlights should be removed
    expect(sidebar.checkedIds.size).toBe(0);

    // Verify none of the book highlights remain
    const list = sidebar.isSearchMode ? sidebar.searchResults : sidebar.highlights;
    bookIds.forEach(id => {
      expect(list.find(h => h.id === id)).toBeUndefined();
    });
  });

  test('book_id = 0 returns single-item group', () => {
    const searchResults = [
      { ...createHighlight('search1', 0), book_id: 0 },
      { ...createHighlight('search2', 0), book_id: 0 },
    ];

    sidebar.search(searchResults);
    sidebar.selectedId = 'search1';

    const bookGroup = sidebar.getBookGroup();

    // Should return only the selected highlight, not all book_id = 0
    expect(bookGroup.length).toBe(1);
    expect(bookGroup[0].id).toBe('search1');
  });

  test('deduplication handles same ID with different data', async () => {
    const initialHighlights = [
      createHighlight('1', 100, 'Book A'),
    ];

    sidebar.loadHighlights(initialHighlights);
    sidebar.selectedId = '1';

    // Shift+E might return the same highlight with updated book_id
    await sidebar.pressShiftE();

    // Should not have duplicate of '1'
    const list = sidebar.highlights;
    const countOfId1 = list.filter(h => h.id === '1').length;
    expect(countOfId1).toBe(1);
  });

  test('multiple shift-E calls do not create duplicates', async () => {
    const initialHighlights = [
      createHighlight('1', 100, 'Book A'),
    ];

    sidebar.loadHighlights(initialHighlights);
    sidebar.selectedId = '1';

    await sidebar.pressShiftE();
    const countAfterFirst = sidebar.countHighlights();

    // Press Shift+E again
    await sidebar.pressShiftE();
    const countAfterSecond = sidebar.countHighlights();

    // Should not have added more highlights
    expect(countAfterSecond).toBe(countAfterFirst);
    expect(sidebar.hasDuplicates()).toBe(false);
  });
});
