/**
 * YandexSearchAPI.ts
 * Direct Yandex Search API integration using XML API
 * Bypasses CAPTCHA by using official API
 */

import * as https from 'https';
import { URL } from 'url';

export interface SearchResult {
  position: number;
  title: string;
  url: string;
  snippet: string;
  displayUrl?: string;
}

export interface YandexSearchResponse {
  query: string;
  totalResults: number;
  results: SearchResult[];
  error?: string;
  message?: string;
  source: 'api' | 'browser';
}

interface YandexAPIOptions {
  numResults?: number;
  region?: string;
  language?: string;
  safeSearch?: boolean;
}

export class YandexSearchAPI {
  private apiKey: string;
  private userId: string;

  constructor() {
    this.apiKey = process.env.YANDEX_SEARCH_API_KEY || '';
    this.userId = process.env.YANDEX_SEARCH_USER_ID || '';
  }

  public isConfigured(): boolean {
    return !!(this.apiKey && this.userId);
  }

  public async search(
    query: string,
    options: YandexAPIOptions = {}
  ): Promise<YandexSearchResponse> {
    if (!this.isConfigured()) {
      return {
        query,
        totalResults: 0,
        results: [],
        error: 'Yandex Search API not configured. Set YANDEX_SEARCH_API_KEY and YANDEX_SEARCH_USER_ID environment variables.',
        source: 'api'
      };
    }

    const {
      numResults = 10,
      region = 'com',
      language = 'en',
      safeSearch = true
    } = options;

    try {
      // Yandex XML API endpoint
      const lr = this.getRegionCode(region, language);
      const filter = safeSearch ? 'strict' : 'none';
      
      // Build the request URL
      const params = new URLSearchParams({
        query: query,
        l10n: language === 'ru' ? 'ru' : 'en',
        sortby: 'rlv',
        filter: filter,
        maxpassages: '5',
        page: '0',
        groupby: 'attr%3D%22%22.mode%3Dflat.groups-on-page%3D' + Math.min(numResults, 100).toString() + '.docs-in-group%3D1',
      });

      // Add user and key
      const requestUrl = `https://yandex.${region}/search/xml?user=${this.userId}&key=${this.apiKey}&${params.toString()}`;

      const xmlResponse = await this.makeRequest(requestUrl);
      return this.parseXMLResponse(xmlResponse, query, numResults);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        query,
        totalResults: 0,
        results: [],
        error: `API Error: ${errorMessage}`,
        source: 'api'
      };
    }
  }

  private getRegionCode(region: string, language: string): string {
    // Yandex region codes (lr parameter)
    const regionMap: Record<string, string> = {
      'com': language === 'ru' ? '225' : '84',  // US default for com
      'ru': '225',  // Russia
      'tr': '11156', // Turkey
      'kz': '159',  // Kazakhstan
      'by': '157',  // Belarus
      'ua': '187',  // Ukraine
    };
    return regionMap[region] || '225';
  }

  private makeRequest(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      
      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'Accept': 'application/xml, text/xml, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 30000,
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  private parseXMLResponse(xml: string, query: string, numResults: number): YandexSearchResponse {
    try {
      const results: SearchResult[] = [];
      
      // Extract total results count
      const foundMatch = xml.match(/<found[^>]*>([\d,]+)<\/found>/);
      let totalResults = 0;
      if (foundMatch) {
        totalResults = parseInt(foundMatch[1].replace(/,/g, ''), 10);
      }

      // Parse individual results using regex
      // Yandex XML format: <doc>...</doc> contains each result
      const docRegex = /<doc[^>]*>([\s\S]*?)<\/doc>/g;
      let match;
      let position = 0;

      while ((match = docRegex.exec(xml)) !== null && position < numResults) {
        const docContent = match[1];
        position++;

        // Extract URL
        const urlMatch = docContent.match(/<url>([^<]*)<\/url>/);
        const url = urlMatch ? this.unescapeXML(urlMatch[1]) : '';

        // Extract title
        const titleMatch = docContent.match(/<title[^>]*>(.*?)<\/title>/s);
        let title = '';
        if (titleMatch) {
          title = this.stripXMLTags(titleMatch[1]).trim();
        }

        // Extract snippet (passages)
        const passages: string[] = [];
        const passageRegex = /<passage[^>]*>(.*?)<\/passage>/gs;
        let passageMatch;
        while ((passageMatch = passageRegex.exec(docContent)) !== null) {
          passages.push(this.stripXMLTags(passageMatch[1]).trim());
        }
        
        // Also try passage elements with different format
        const passageRegex2 = /<Passage[^>]*>(.*?)<\/Passage>/gs;
        while ((passageMatch = passageRegex2.exec(docContent)) !== null) {
          passages.push(this.stripXMLTags(passageMatch[1]).trim());
        }

        const snippet = passages.join(' ').substring(0, 500);

        // Generate display URL
        let displayUrl = '';
        if (url) {
          try {
            const urlObj = new URL(url);
            displayUrl = urlObj.hostname.replace('www.', '');
          } catch {
            displayUrl = url;
          }
        }

        if (title && url) {
          results.push({
            position,
            title,
            url,
            snippet,
            displayUrl
          });
        }
      }

      return {
        query,
        totalResults: totalResults || results.length * 100,
        results: results.slice(0, numResults),
        source: 'api'
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        query,
        totalResults: 0,
        results: [],
        error: `XML Parse Error: ${errorMessage}`,
        source: 'api'
      };
    }
  }

  private stripXMLTags(str: string): string {
    return str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private unescapeXML(str: string): string {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#x27;/g, "'");
  }
}

export default YandexSearchAPI;
