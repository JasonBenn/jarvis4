interface HighlightState {
  id: string;
  text: string;
  status: 'NEW' | 'INTEGRATED' | 'ARCHIVED';
  snoozeHistory: string | null;
  nextShowDate: string | null;
  firstSeen: string;
  lastUpdated: string;
  bookId: number;
  book?: {
    id: number;
    title: string;
    author: string;
    uniqueUrl?: string;
  };
}

export class HighlightDatabase {
  private baseUrl: string;

  constructor(private dbPath: string) {
    // dbPath is ignored now - we use HTTP backend
    const port = process.env.JARVIS4_PORT || '3456';
    this.baseUrl = `http://127.0.0.1:${port}`;
  }

  async initialize(): Promise<void> {
    // Check if backend is running
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      if (!response.ok) {
        throw new Error('Backend health check failed');
      }
      console.log('Connected to Jarvis4 backend');
    } catch (error) {
      throw new Error(
        'Jarvis4 backend is not running. Start it with: launchctl start com.jasonbenn.jarvis4-backend'
      );
    }
  }


  async getVisibleHighlightIds(limit?: number, offset?: number): Promise<any[]> {
    try {
      const params = new URLSearchParams();
      if (limit !== undefined) params.append('limit', limit.toString());
      if (offset !== undefined) params.append('offset', offset.toString());

      const url = `${this.baseUrl}/highlights${params.toString() ? '?' + params.toString() : ''}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch highlights: ${response.statusText}`);
      }
      const data = await response.json() as { highlights: any[] };
      return data.highlights;
    } catch (error) {
      console.error('Error fetching visible highlights:', error);
      return [];
    }
  }

  async getHighlightState(id: string): Promise<HighlightState | null> {
    try {
      const response = await fetch(`${this.baseUrl}/highlights/${id}`);
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`Failed to fetch highlight state: ${response.statusText}`);
      }
      const data = await response.json() as HighlightState;
      return data;
    } catch (error) {
      console.error('Error fetching highlight state:', error);
      return null;
    }
  }

  async trackHighlight(id: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/highlights/${id}/track`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(`Failed to track highlight: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error tracking highlight:', error);
    }
  }

  async updateStatus(id: string, status: 'INTEGRATED' | 'ARCHIVED'): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/highlights/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        throw new Error(`Failed to update status: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
  }

  async snoozeHighlight(id: string, durationWeeks: number = 4): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/highlights/${id}/snooze`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationWeeks }),
      });
      if (!response.ok) {
        throw new Error(`Failed to snooze highlight: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error snoozing highlight:', error);
    }
  }

  async getSnoozeCount(id: string): Promise<number> {
    const state = await this.getHighlightState(id);
    if (!state || !state.snoozeHistory) {return 0;}

    try {
      const history = JSON.parse(state.snoozeHistory as string);
      return Array.isArray(history) ? history.length : 0;
    } catch {
      return 0;
    }
  }


  // Metadata operations
  async getLastReadwiseFetch(): Promise<string | null> {
    return this.getMetadata('lastReadwiseFetch');
  }

  async setLastReadwiseFetch(date: string): Promise<void> {
    await this.setMetadata('lastReadwiseFetch', date);
  }

  private async getMetadata(key: string): Promise<string | null> {
    try {
      const response = await fetch(`${this.baseUrl}/metadata/${key}`);
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`Failed to fetch metadata: ${response.statusText}`);
      }
      const data = await response.json() as { key: string; value: string };
      return data.value;
    } catch (error) {
      console.error('Error fetching metadata:', error);
      return null;
    }
  }

  private async setMetadata(key: string, value: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/metadata/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (!response.ok) {
        throw new Error(`Failed to set metadata: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error setting metadata:', error);
    }
  }

  async syncHighlights(books: any[], highlights: any[]): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books, highlights }),
      });
      if (!response.ok) {
        throw new Error(`Failed to sync: ${response.statusText}`);
      }
      const result = await response.json();
      console.log('Synced to DB:', result);
    } catch (error) {
      console.error('Error syncing highlights:', error);
      throw error;
    }
  }

  dispose(): void {
    // No cleanup needed for HTTP client
  }
}
