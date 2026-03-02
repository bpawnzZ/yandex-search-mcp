/**
 * YandexSearchTool.ts
 * MCP tool for Yandex search automation
 */

import { MCPTool } from 'mcp-framework';
import { z } from 'zod';
import BrowserManager from '../browser/BrowserManager.js';

interface YandexSearchInput {
  query: string;
  numResults?: number;
  region?: string;
  language?: string;
  safeSearch?: boolean;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface YandexSearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
  region: string;
}

export class YandexSearchTool extends MCPTool<YandexSearchInput> {
  name = 'yandex_search';
  description = 'Search Yandex.com and return results';

  schema = {
    query: {
      type: z.string(),
      description: 'The search query to execute on Yandex',
    },
    numResults: {
      type: z.number().optional(),
      description: 'Number of results to return (default: 10, max: 50)',
      default: 10,
    },
    region: {
      type: z.string().optional(),
      description: 'Yandex region (com, ru, tr, etc.)',
      default: 'com',
    },
    language: {
      type: z.string().optional(),
      description: 'Language for search results (en, ru, tr, etc.)',
      default: 'en',
    },
    safeSearch: {
      type: z.boolean().optional(),
      description: 'Enable safe search filter',
      default: true,
    },
  };

  private browserManager: BrowserManager;

  constructor() {
    super();
    this.browserManager = BrowserManager.getInstance();
  }

  async execute(input: YandexSearchInput): Promise<{
    content: Array<{ type: 'text'; text: string }>;
  }> {
    const {
      query,
      numResults = 10,
      region = 'com',
      language = 'en',
      safeSearch = true
    } = input;

    try {
      await this.browserManager.initialize();

      const results = await this.browserManager.searchYandex(query, {
        numResults,
        region,
        language,
        safeSearch,
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(results, null, 2),
        }],
      } as any;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ error: errorMessage }, null, 2),
        }],
      } as any;
    }
  }
}

export default YandexSearchTool;
