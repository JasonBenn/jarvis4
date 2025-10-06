// Stub database - no actual persistence for now
// TODO: Add real database later (sqlite, indexeddb, or file-based storage)

interface HighlightState {
  id: string;
  status: 'NEW' | 'INTEGRATED' | 'ARCHIVED';
  snooze_history: string | null;
  next_show_date: string | null;
  first_seen: string;
  last_updated: string;
}

export class HighlightDatabase {
  private inMemoryStore: Map<string, HighlightState> = new Map();

  constructor(private dbPath: string) {}

  initialize(): void {
    // No-op for now - in-memory storage
    console.log('Database initialized (in-memory stub)');
  }

  getVisibleHighlightIds(): string[] {
    // If store is empty, return empty array (no highlights tracked yet)
    // When highlights are fetched and tracked, they'll be returned here
    return Array.from(this.inMemoryStore.values())
      .filter(state => state.status === 'NEW')
      .map(state => state.id);
  }

  getHighlightState(id: string): HighlightState | null {
    return this.inMemoryStore.get(id) || null;
  }

  trackHighlight(id: string): void {
    if (!this.inMemoryStore.has(id)) {
      const now = new Date().toISOString();
      this.inMemoryStore.set(id, {
        id,
        status: 'NEW',
        snooze_history: null,
        next_show_date: null,
        first_seen: now,
        last_updated: now
      });
    }
  }

  updateStatus(id: string, status: 'INTEGRATED' | 'ARCHIVED'): void {
    const state = this.inMemoryStore.get(id);
    if (state) {
      state.status = status;
      state.last_updated = new Date().toISOString();
    }
  }

  snoozeHighlight(id: string, durationWeeks: number = 4): void {
    const state = this.inMemoryStore.get(id);
    if (!state) {return;}

    const now = new Date().toISOString();
    const snoozeHistory = state.snooze_history
      ? JSON.parse(state.snooze_history)
      : [];
    snoozeHistory.push(now);

    const nextShowDate = new Date();
    nextShowDate.setDate(nextShowDate.getDate() + (durationWeeks * 7));

    state.snooze_history = JSON.stringify(snoozeHistory);
    state.next_show_date = nextShowDate.toISOString();
    state.last_updated = now;
  }

  getSnoozeCount(id: string): number {
    const state = this.inMemoryStore.get(id);
    if (!state || !state.snooze_history) {return 0;}

    const history = JSON.parse(state.snooze_history);
    return Array.isArray(history) ? history.length : 0;
  }

  dispose(): void {
    // No-op for in-memory storage
  }
}
