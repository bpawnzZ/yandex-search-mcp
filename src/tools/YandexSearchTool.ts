/**
 * YandexSearchTool.ts
 * MCP tool for Yandex search automation
 * Uses Yandex Search API as primary, browser automation as fallback
 */

import { MCPTool } from 'mcp-framework';
import { z } from 'zod';
import BrowserManager from '../browser/BrowserManager.js';
import YandexSearchAPI from '../api/YandexSearchAPI.js';

interface YandexSearchInput {
  query: string;
  numResults?: number;
  region?: string;
  language?: string;
  safeSearch?: boolean;
  useBrowser?: boolean;
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
  source?: 'api' | 'browser';
  message?: string;
  error?: string;
  debug?: any;
}

export class YandexSearchTool extends MCPTool<YandexSearchInput> {
  name = 'yandex_search';
  description = 'Search Yandex.com and return results. Uses Yandex Search API if configured (YANDEX_SEARCH_API_KEY env var), otherwise uses browser automation. If you encounter CAPTCHA errors with browser mode, obtain a Yandex Search API key for reliable access.';

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
    useBrowser: {
      type: z.boolean().optional(),
      description: 'Force browser automation mode instead of API (default: false, auto-detect)',
      default: false,
    },
  };

  private browserManager: BrowserManager;
  private yandexAPI: YandexSearchAPI;

  constructor() {
    super();
    this.browserManager = BrowserManager.getInstance();
    this.yandexAPI = new YandexSearchAPI();
  }

  async execute(input: YandexSearchInput) {
    const {
      query,
      numResults = 10,
      region = 'com',
      language = 'en',
      safeSearch = true,
      useBrowser = false
    } = input;

    // Try API first if available and not forced to use browser
    if (!useBrowser && this.yandexAPI.isConfigured()) {
      try {
        const apiResult = await this.yandexAPI.search(query, {
          numResults,
          region,
          language,
          safeSearch
        });

        if (!apiResult.error) {
          return {
            results: apiResult.results,
            total: apiResult.totalResults,
            query,
            region,
            source: 'api'
          };
        }

        // API failed, fall through to browser
        console.log(`API search failed: ${apiResult.error}, falling back to browser...`);
      } catch (apiError) {
        console.log('API error, falling back to browser:', apiError);
      }
    }

    // Use browser automation
    try {
      await this.browserManager.initialize();

      const results = await this.browserManager.searchYandex(query, {
        numResults,
        region,
        language,
        safeSearch,
      });

      // Format response
      const response: YandexSearchResponse = {
        results: results.results,
        total: results.totalResults,
        query,
        region,
        source: results.source,
      };

      if (results.error) {
        response.error = results.error;
        // Add helpful message for CAPTCHA errors
        if (results.error.includes('CAPTCHA')) {
          response.message = 'To avoid CAPTCHA, consider: 1) Setting YANDEX_SEARCH_API_KEY for API access (30k free requests/day), 2) Using a residential proxy via PROXY_URL env var, 3) Updating cookies by visiting yandex.com in a regular browser and exporting fresh cookies';
        }
      } else if (results.message) {
        response.message = results.message;
      }

      // Add debug info if available
      if (results.debug) {
        response.debug = results.debug;
      }

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      const response: YandexSearchResponse = {
        results: [],
        total: 0,
        query,
        region,
        error: errorMessage,
      };

      // Add helpful message for initialization errors
      if (errorMessage.includes('executable doesn\'t exist') || errorMessage.includes('chromium')) {
        response.message = 'Browser not installed. Run: npx playwright install chromium';
      }

      return response;
    }
  }
}

export default YandexSearchTool;
