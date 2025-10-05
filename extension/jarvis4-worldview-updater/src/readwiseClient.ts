import { Readwise } from 'readwise-reader-api';
import type { ReadwiseBookHighlights, ReadwiseHighlight } from 'readwise-reader-api';

export class ReadwiseClient {
  private client: Readwise;

  constructor(apiToken: string) {
    this.client = new Readwise({
      auth: apiToken
    });
  }

  async fetchHighlights(updatedAfter?: string): Promise<ReadwiseBookHighlights[]> {
    // The SDK handles pagination automatically
    const response = await this.client.highlights.export({
      updatedAfter
    });

    return response;
  }

  // Helper to get all highlights with their parent book info
  async fetchAllHighlightsWithBooks(updatedAfter?: string): Promise<Array<{
    highlight: ReadwiseHighlight;
    book: ReadwiseBookHighlights;
  }>> {
    const books = await this.fetchHighlights(updatedAfter);

    const results: Array<{ highlight: ReadwiseHighlight; book: ReadwiseBookHighlights }> = [];

    for (const book of books) {
      for (const highlight of book.highlights) {
        results.push({ highlight, book });
      }
    }

    return results;
  }
}
