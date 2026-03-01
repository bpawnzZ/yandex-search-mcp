/**
 * BrowserManager.ts
 * Manages Playwright browser instance with stealth plugins
 */

import { chromium } from 'playwright-extra';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import stealth from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import * as path from 'path';

chromium.use(stealth());

export interface SearchOptions {
  numResults?: number;
  region?: string;
  language?: string;
  safeSearch?: boolean;
}

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
}

export class BrowserManager {
  private static instance: BrowserManager;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private cookiesPath: string;

  private constructor() {
    this.cookiesPath = path.join(process.cwd(), 'cookies', 'yandex-cookies.json');
  }

  public static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }

  public async initialize(): Promise<void> {
    if (this.browser) {
      return;
    }

    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    });

    this.page = await this.context.newPage();

    await this.loadCookies();
  }

  public async getContext(): Promise<BrowserContext> {
    if (!this.context) {
      await this.initialize();
    }
    return this.context!;
  }

  public async getPage(): Promise<Page> {
    if (!this.page) {
      await this.initialize();
    }
    return this.page!;
  }

  public async loadCookies(): Promise<void> {
    if (!this.context) {
      throw new Error('Browser context not initialized. Call initialize() first.');
    }

    if (!fs.existsSync(this.cookiesPath)) {
      return;
    }

    try {
      const cookiesData = fs.readFileSync(this.cookiesPath, 'utf-8');
      const cookies = JSON.parse(cookiesData);

      if (Array.isArray(cookies) && cookies.length > 0) {
        await this.context.addCookies(cookies);
      }
    } catch (error) {
      console.error('Failed to load cookies:', error);
    }
  }

  public async saveCookies(): Promise<void> {
    if (!this.context) {
      throw new Error('Browser context not initialized');
    }

    try {
      const cookies = await this.context.cookies();
      const dir = path.dirname(this.cookiesPath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.cookiesPath, JSON.stringify(cookies, null, 2));
    } catch (error) {
      console.error('Failed to save cookies:', error);
    }
  }

  public async searchYandex(
    query: string,
    options: SearchOptions = {}
  ): Promise<YandexSearchResponse> {
    if (!this.page) {
      await this.initialize();
    }

    const {
      numResults = 10,
      region = 'com',
      language = 'en',
      safeSearch = true
    } = options;

    const maxRetries = 3;
    const baseDelay = 1000;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const regionDomain = region === 'com' ? 'com' : `${region}`;
        const url = `https://yandex.${regionDomain}/search/?text=${encodeURIComponent(query)}&numdoc=${Math.min(numResults, 50)}&lang=${language}&safe=${safeSearch ? 1 : 0}`;

        await this.page!.goto(url, {
          waitUntil: 'networkidle',
          timeout: 30000
        });

        await this.page!.waitForSelector('.serp-list, .Organic, .serp-item', { timeout: 10000 }).catch(() => null);

        const isCaptcha = await this.page!.evaluate(() => {
          return document.querySelector('.captcha, #captcha, [class*="captcha"]') !== null ||
                 document.body.textContent?.includes('Please confirm') ||
                 document.body.textContent?.includes('Robot check');
        });

        if (isCaptcha) {
          if (attempt < maxRetries - 1) {
            const delay = baseDelay * Math.pow(2, attempt);
            await this.page!.waitForTimeout(delay);
            continue;
          }
          return {
            query,
            totalResults: 0,
            results: [],
            error: 'CAPTCHA detected'
          };
        }

        const results = await this.page!.evaluate((requestedNum) => {
          const items: SearchResult[] = [];
          const serpItems = document.querySelectorAll('.serp-item, .Organic');
          let position = 0;

          serpItems.forEach((item) => {
            const titleEl = item.querySelector('.organic__title, .serp-item__title, h2 a, .OrganicTitle a');
            const urlEl = item.querySelector('.organic__url, .serp-item__url a, .OrganicUrl a');
            const snippetEl = item.querySelector('.organic__snippet, .serp-item__text, .OrganicDescription');

            if (titleEl && urlEl) {
              position++;
              const title = titleEl.textContent?.trim() || '';
              const url = (urlEl.getAttribute('href') || '').trim();

              let snippet = '';
              if (snippetEl) {
                snippet = snippetEl.textContent?.trim() || '';
              } else {
                const fullText = item.textContent || '';
                snippet = fullText.replace(title, '').replace(url, '').trim().substring(0, 300);
              }

              let displayUrl = '';
              try {
                const urlObj = new URL(url);
                displayUrl = urlObj.hostname.replace('www.', '');
              } catch {
                displayUrl = url;
              }

              if (title && url) {
                items.push({
                  position,
                  title,
                  url,
                  snippet: snippet.substring(0, 500),
                  displayUrl
                });
              }
            }
          });

          let totalResults = 0;
          const resultsCountEl = document.querySelector('.serp-info__results, .search-results__total, .serp-total-results');
          if (resultsCountEl) {
            const text = resultsCountEl.textContent || '';
            const match = text.match(/(\d[\d\s]*)/);
            if (match) {
              totalResults = parseInt(match[1].replace(/\s/g, ''), 10);
            }
          }

          if (totalResults === 0 && items.length > 0) {
            totalResults = items.length * 100;
          }

          return { items, totalResults };
        }, numResults);

        if (results.items.length === 0) {
          return {
            query,
            totalResults: 0,
            results: [],
            message: 'No results found'
          };
        }

        return {
          query,
          totalResults: results.totalResults,
          results: results.items.slice(0, numResults)
        };

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes('net::ERR_') || errorMessage.includes('Timeout')) {
          if (attempt < maxRetries - 1) {
            const delay = baseDelay * Math.pow(2, attempt);
            await this.page!.waitForTimeout(delay);
            continue;
          }
        }

        return {
          query,
          totalResults: 0,
          results: [],
          error: errorMessage
        };
      }
    }

    return {
      query,
      totalResults: 0,
      results: [],
      error: 'Max retries exceeded'
    };
  }

  public async close(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }

    if (this.context) {
      await this.context.close();
      this.context = null;
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export default BrowserManager;
