import { Readwise } from 'readwise-reader-api';
import type { ReadwiseBookHighlights, ReadwiseHighlight } from 'readwise-reader-api';
import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';

const LOG_FILE = '/tmp/readwise-search.log';

function log(...args: any[]) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')}\n`;
  fs.appendFileSync(LOG_FILE, message);
  console.log(...args);
}

interface MCPSearchQuery {
  field_name: 'document_author' | 'document_title' | 'highlight_note' | 'highlight_plaintext' | 'highlight_tags';
  search_term: string;
}

interface MCPSearchPayload {
  vector_search_term?: string;
  full_text_queries?: MCPSearchQuery[];
}

interface MCPSearchResult {
  id: number;
  score: number;
  attributes: {
    highlight_plaintext: string;
    highlight_note?: string;
    highlight_tags: string[];
    document_title: string;
    document_author?: string;
    document_category?: string;
    document_tags: string[];
  };
}

export class ReadwiseClient {
  private client: Readwise;
  private axios: AxiosInstance;
  private apiToken: string;
  private openai: OpenAI | null = null;

  constructor(apiToken: string, openaiKey?: string) {
    this.apiToken = apiToken;
    this.client = new Readwise({
      auth: apiToken
    });

    this.axios = axios.create({
      baseURL: 'https://readwise.io',
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Access-Token': apiToken,
      }
    });

    // Initialize OpenAI client if API key is available
    if (openaiKey) {
      this.openai = new OpenAI({ apiKey: openaiKey });
      log('OpenAI client initialized for query compression');
    } else {
      log('OPENAI_API_KEY not found, query compression disabled');
    }
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

  private async compressQuery(text: string): Promise<string> {
    if (!this.openai) {
      log('OpenAI not available, truncating instead');
      return text.substring(0, 1000);
    }

    try {
      log(`Compressing query with GPT-4o-mini (${text.length} chars)`);
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Compress the following text into a concise search query that captures the key themes and concepts. Output ONLY the compressed query, no preamble:\n\n${text}`
        }]
      });

      const compressed = response.choices[0]?.message?.content || text.substring(0, 1000);
      log(`Compressed to ${compressed.length} chars: ${compressed}`);
      return compressed;
    } catch (error) {
      log('Error compressing query with GPT:', error);
      return text.substring(0, 1000);
    }
  }

  // Search highlights using Readwise MCP API
  async searchHighlights(vectorSearchTerm?: string, fullTextQueries?: MCPSearchQuery[]): Promise<MCPSearchResult[]> {
    const payload: MCPSearchPayload = {};

    if (vectorSearchTerm) {
      // Limit query to 1000 characters, compress with GPT if too long
      const maxLength = 1000;
      if (vectorSearchTerm.length > maxLength) {
        log(`Query too long (${vectorSearchTerm.length} chars), compressing with GPT`);
        payload.vector_search_term = await this.compressQuery(vectorSearchTerm);
      } else {
        payload.vector_search_term = vectorSearchTerm;
      }
    }

    if (fullTextQueries && fullTextQueries.length > 0) {
      payload.full_text_queries = fullTextQueries.slice(0, 8); // Max 8 queries
    }

    // Ensure we have at least one search parameter
    if (!payload.vector_search_term && (!payload.full_text_queries || payload.full_text_queries.length === 0)) {
      throw new Error('At least one of vector_search_term or full_text_queries must be provided');
    }

    try {
      log('Search payload:', payload);
      const response = await this.axios.post<{ results: MCPSearchResult[] }>('/api/mcp/highlights', payload);
      log('Search response:', { resultCount: response.data.results.length });
      return response.data.results;
    } catch (error: any) {
      log('ERROR: Readwise MCP search failed:', error.message);
      log('ERROR: Response data:', error.response?.data);
      log('ERROR: Response status:', error.response?.status);
      log('ERROR: Payload was:', payload);
      throw error;
    }
  }
}
