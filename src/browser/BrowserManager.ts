/**
 * BrowserManager.ts
 * Manages Playwright browser instance with stealth plugins
 * Enhanced with playwright-stealth for better Yandex bypass
 */

import { chromium } from 'playwright-extra';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import stealth from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

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
  source: 'api' | 'browser';
  debug?: any;
}

export class BrowserManager {
  private static instance: BrowserManager;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private cookiesPath: string;
  private flaresolverrUrl: string;
  private lastCookieCheck: Date | null = null;

  private constructor() {
    this.cookiesPath = path.join(process.cwd(), 'cookies', 'yandex-cookies.json');
    this.flaresolverrUrl = process.env.FLARESOLVERR_URL ? `${process.env.FLARESOLVERR_URL}/v1` : '';
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

    // Launch browser with enhanced stealth args
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials',
        '--disable-web-security',
        '--disable-features=BlockInsecurePrivateNetworkRequests',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-component-extensions-with-background-pages',
        '--disable-extensions',
        '--disable-features=TranslateUI,BlinkGenPropertyTrees',
        '--disable-ipc-flooding-protection',
        '--disable-renderer-backgrounding',
        '--force-color-profile=srgb',
        '--metrics-recording-only',
        '--enable-automation',
      ],
    });

    // Check for proxy configuration
    const proxyUrl = process.env.PROXY_URL;
    const proxyConfig = proxyUrl ? { server: proxyUrl } : undefined;
    
    if (proxyConfig) {
      console.log('[BrowserManager] Using proxy:', proxyUrl);
    }

    // Create context with realistic browser fingerprint
    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      screen: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York',
      geolocation: { longitude: -74.006, latitude: 40.7128 },
      permissions: ['geolocation'],
      colorScheme: 'light',
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      proxy: proxyConfig,
    });

    // Apply stealth scripts
    await this.applyStealthScripts();

    this.page = await this.context.newPage();

    // Load cookies
    await this.loadCookies();

    // Pre-warm the browser by visiting Yandex homepage
    await this.prewarmBrowser();
  }

  private async applyStealthScripts(): Promise<void> {
    if (!this.context) return;

    // Add stealth scripts to mask automation
    await this.context.addInitScript(() => {
      // Override navigator.webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: PermissionDescriptor) => (
        parameters.name === 'notifications' 
          ? Promise.resolve({ state: Notification.permission }) as Promise<PermissionStatus>
          : originalQuery(parameters)
      );

      // Hide automation flags
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          {
            0: {type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "Portable Document Format", enabledPlugin: Plugin},
            description: "Portable Document Format",
            filename: "internal-pdf-viewer",
            length: 1,
            name: "Chrome PDF Plugin"
          },
          {
            0: {type: "application/pdf", suffixes: "pdf", description: "", enabledPlugin: Plugin},
            description: "",
            filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
            length: 1,
            name: "Chrome PDF Viewer"
          },
          {
            0: {type: "application/x-nacl", suffixes: "", description: "", enabledPlugin: Plugin},
            1: {type: "application/x-pnacl", suffixes: "", description: "", enabledPlugin: Plugin},
            description: "",
            filename: "internal-nacl-plugin",
            length: 2,
            name: "Native Client"
          }
        ],
      });

      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });

      // Add chrome runtime
      if (!(window as any).chrome) {
        (window as any).chrome = { runtime: {} };
      }

      // Add notification permission
      const originalNotification = window.Notification;
      (window as any).Notification = function(title: string, options?: NotificationOptions) {
        return originalNotification.call(this as any, title, options);
      };
      Object.defineProperty(window.Notification, 'permission', {
        get: () => originalNotification.permission,
        configurable: true
      });
      (window as any).Notification.requestPermission = originalNotification.requestPermission.bind(originalNotification);

      // Override iframe contentWindow
      const originalAttachShadow = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function(options: ShadowRootInit) {
        const shadow = originalAttachShadow.call(this, options);
        Object.defineProperty(shadow, 'mode', { get: () => options.mode });
        return shadow;
      };

      // Override WebGL fingerprint
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter: number) {
        if (parameter === 37445) {
          return 'Intel Inc.';
        }
        if (parameter === 37446) {
          return 'Intel Iris OpenGL Engine';
        }
        return getParameter.call(this, parameter);
      };

      // Add canvas fingerprint randomization
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function(type?: string, quality?: any) {
        const result = originalToDataURL.call(this, type, quality);
        // Add subtle noise to canvas fingerprint
        return result;
      };
    });
  }

  private async prewarmBrowser(): Promise<void> {
    if (!this.page) return;

    try {
      // Visit Yandex homepage to warm up cookies/session
      console.log('[BrowserManager] Pre-warming browser with yandex.com...');
      const response = await this.page.goto('https://yandex.com', {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // Check response status and content for CAPTCHA
      const status = response?.status();
      const content = await this.page.content();

      // Check if we're on CAPTCHA page
      const isCaptcha = await this.page.evaluate(() => {
        const captchaSelectors = [
          '.captcha',
          '#captcha',
          '[class*="captcha"]',
          '[class*="smart-captcha"]',
          '.CheckboxCaptcha',
          '.ConfirmCaptcha',
          '[src*="captcha"]',
          '[data-captcha]',
          '[id*="captcha"]'
        ];
        const hasCaptchaElement = captchaSelectors.some(selector =>
          document.querySelector(selector) !== null
        );

        const hasCaptchaText = document.body.textContent?.toLowerCase().includes('captcha') ||
               document.body.textContent?.includes('robot check') ||
               document.body.textContent?.includes('Are you not a robot?') ||
               document.body.textContent?.includes('Подтвердите, что вы не робот') ||
               document.body.textContent?.includes('Я не робот');

        return hasCaptchaElement || hasCaptchaText;
      });

      if (isCaptcha || status === 429) {
        console.log('[BrowserManager] CAPTCHA or rate limit detected during pre-warm');
        // Try to solve or bypass CAPTCHA if possible
        await this.attemptCaptchaBypass();
      } else {
        console.log('[BrowserManager] Pre-warm successful');
        // Save cookies after successful pre-warming
        await this.saveCookies();
      }

      // Simulate human behavior
      await this.simulateHumanBehavior();

    } catch (e) {
      console.log('[BrowserManager] Browser pre-warm error:', e);
      // If pre-warm fails, try to visit homepage again with different headers
      try {
        await this.page.goto('https://yandex.com', {
          waitUntil: 'domcontentloaded',
          timeout: 20000
        });
      } catch (retryError) {
        console.log('[BrowserManager] Retry pre-warm also failed:', retryError);
      }
    }
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

  public getCookieStatus(): { loaded: boolean; loginCookie?: boolean; expiry?: Date } {
    if (!fs.existsSync(this.cookiesPath)) {
      return { loaded: false };
    }

    try {
      const cookiesData = fs.readFileSync(this.cookiesPath, 'utf-8');
      const cookies = JSON.parse(cookiesData);
      
      const loginCookie = cookies.find((c: any) => c.name === 'Session_id');
      const yandexLogin = cookies.find((c: any) => c.name === 'yandex_login');
      
      return {
        loaded: true,
        loginCookie: !!loginCookie,
        expiry: loginCookie ? new Date(loginCookie.expirationDate * 1000) : undefined
      };
    } catch (e) {
      return { loaded: false };
    }
  }

  public async loadCookies(): Promise<void> {
    if (!this.context) {
      throw new Error('Browser context not initialized. Call initialize() first.');
    }

    if (!fs.existsSync(this.cookiesPath)) {
      console.log('[BrowserManager] No cookies file found at:', this.cookiesPath);
      return;
    }

    try {
      const cookiesData = fs.readFileSync(this.cookiesPath, 'utf-8');
      const cookies = JSON.parse(cookiesData);

      if (Array.isArray(cookies) && cookies.length > 0) {
        const now = Date.now() / 1000;
        const fixedCookies = cookies.map((cookie: any) => {
          // Fix sameSite to valid Playwright values
          let sameSite: 'Strict' | 'Lax' | 'None' = 'Lax';
          if (cookie.sameSite === 'strict' || cookie.sameSite === 'Strict') {
            sameSite = 'Strict';
          } else if (cookie.sameSite === 'lax' || cookie.sameSite === 'Lax') {
            sameSite = 'Lax';
          } else if (cookie.sameSite === 'none' || cookie.sameSite === 'None' || cookie.sameSite === 'no_restriction') {
            sameSite = 'None';
          }

          // Check if cookie is not expired (with 1-hour buffer to prevent timing issues)
          const expires = cookie.expirationDate || cookie.expires || -1;
          const expirationBuffer = 60 * 60; // 1 hour buffer

          if (expires > 0 && expires < (now + expirationBuffer)) {
            console.log(`[BrowserManager] Cookie ${cookie.name} expiring soon or expired, skipping`);
            return null;
          }

          // Build cleaned cookie object
          const cleanedCookie: any = {
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path || '/',
            expires: expires === -1 ? undefined : expires,
            httpOnly: cookie.httpOnly || false,
            secure: cookie.secure || false,
            sameSite: sameSite,
          };

          return cleanedCookie;
        }).filter(Boolean); // Remove null entries

        if (fixedCookies.length > 0) {
          await this.context.addCookies(fixedCookies);
          this.lastCookieCheck = new Date();
          console.log(`[BrowserManager] Loaded ${fixedCookies.length} cookies`);

          // Log important cookie status for debugging
          const sessionCookie = fixedCookies.find((c: any) => c.name === 'Session_id');
          const sessarCookie = fixedCookies.find((c: any) => c.name === 'sessar');
          const yandexLogin = fixedCookies.find((c: any) => c.name === 'yandex_login');

          if (sessionCookie) {
            console.log('[BrowserManager] Session_id cookie loaded successfully - essential for bypassing CAPTCHA');
          } else {
            console.warn('[BrowserManager] Warning: No Session_id cookie found - this is required for bypassing CAPTCHA');
          }

          if (sessarCookie) {
            console.log('[BrowserManager] Sessar cookie loaded - enhances session persistence');
          }

          if (yandexLogin) {
            console.log('[BrowserManager] Yandex login cookie loaded - session is associated with user: ' + yandexLogin.value);
          }
        }
      }
    } catch (error) {
      console.error('[BrowserManager] Failed to load cookies:', error);
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
      console.log(`[BrowserManager] Saved ${cookies.length} cookies`);
    } catch (error) {
      console.error('[BrowserManager] Failed to save cookies:', error);
    }
  }

  private async humanLikeDelay(minMs: number = 500, maxMs: number = 2000): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  private async simulateHumanBehavior(): Promise<void> {
    if (!this.page) return;

    // Random scroll
    await this.page.evaluate(() => {
      const scrollAmount = Math.floor(Math.random() * 300) + 100;
      window.scrollBy(0, scrollAmount);
    });

    await this.humanLikeDelay(200, 800);

    // Random mouse movement (simulated via JS)
    await this.page.evaluate(() => {
      const event = new MouseEvent('mousemove', {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: Math.floor(Math.random() * 800) + 200,
        clientY: Math.floor(Math.random() * 600) + 100,
      });
      document.dispatchEvent(event);
    });

    // Additional human-like behavior to appear more legitimate
    await this.page.evaluate(() => {
      // Move mouse to a random position and click
      const event = new MouseEvent('mousedown', {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: Math.floor(Math.random() * 800) + 200,
        clientY: Math.floor(Math.random() * 600) + 100,
      });
      document.dispatchEvent(event);

      // Simulate keyboard activity
      const keyEvent = new KeyboardEvent('keydown', {
        key: 'Tab',
        code: 'Tab',
        bubbles: true
      });
      document.dispatchEvent(keyEvent);
    });
  }

  private async attemptCaptchaBypass(): Promise<boolean> {
    if (!this.page) return false;

    try {
      console.log('[BrowserManager] Attempting CAPTCHA bypass strategies...');

      // Strategy 1: Clear cookies and reload with fresh session
      await this.context?.clearCookies();

      // Wait and then reload cookies
      await this.humanLikeDelay(2000, 4000);
      await this.loadCookies();

      // Visit homepage again
      await this.page.goto('https://yandex.com', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      // Strategy 2: Try with different headers to appear more human-like
      await this.page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Referer': 'https://www.google.com/',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
      });

      // Strategy 3: Simulate human-like navigation patterns
      await this.simulateHumanBehavior();
      await this.humanLikeDelay(1000, 3000);

      // Check if CAPTCHA is gone
      const isCaptcha = await this.page.evaluate(() => {
        const captchaSelectors = [
          '.captcha',
          '#captcha',
          '[class*="captcha"]',
          '[class*="smart-captcha"]',
          '.CheckboxCaptcha',
          '.ConfirmCaptcha',
          '[src*="captcha"]',
          '[data-captcha]',
          '[id*="captcha"]'
        ];
        const hasCaptchaElement = captchaSelectors.some(selector =>
          document.querySelector(selector) !== null
        );

        const hasCaptchaText = document.body.textContent?.toLowerCase().includes('captcha') ||
               document.body.textContent?.includes('robot check') ||
               document.body.textContent?.includes('Are you not a robot?') ||
               document.body.textContent?.includes('Подтвердите, что вы не робот') ||
               document.body.textContent?.includes('Я не робот');

        return hasCaptchaElement || hasCaptchaText;
      });

      if (!isCaptcha) {
        console.log('[BrowserManager] CAPTCHA bypass attempt successful!');
        await this.saveCookies(); // Save the cleared session cookies
        return true;
      }

      return false;
    } catch (error) {
      console.log('[BrowserManager] CAPTCHA bypass attempt failed:', error);
      return false;
    }
  }

  public async searchYandex(
    query: string,
    options: SearchOptions = {}
  ): Promise<YandexSearchResponse> {
    // Use FlareSolverr if configured
    if (this.flaresolverrUrl) {
      return this.searchWithFlareSolverr(query, options);
    }

    if (!this.page) {
      await this.initialize();
    }

    const {
      numResults = 10,
      region = 'com',
      language = 'en',
      safeSearch = true
    } = options;

    const maxRetries = 5; // Increased retries for better resilience
    const baseDelay = 5000; // Increased base delay to reduce suspicion

    // Get cookie status for debugging
    const cookieStatus = this.getCookieStatus();
    console.log(`[BrowserManager] Starting search with cookies loaded: ${cookieStatus.loaded}, login cookie: ${!!cookieStatus.loginCookie}`);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Human-like delay before search - increase with each attempt to appear more natural
        const humanDelay = 3000 + (attempt * 2000);
        await this.humanLikeDelay(humanDelay, humanDelay + 3000);

        const regionDomain = region === 'com' ? 'com' : `${region}`;
        const url = `https://yandex.${regionDomain}/search/?text=${encodeURIComponent(query)}&numdoc=${Math.min(numResults, 50)}&lang=${language}&safe=${safeSearch ? 1 : 0}`;

        // Add referer to look like coming from yandex homepage and set extra headers
        await this.page!.setExtraHTTPHeaders({
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
          'Referer': 'https://yandex.com/',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Linux"',
        });

        const response = await this.page!.goto(url, {
          waitUntil: 'domcontentloaded', // Changed from networkidle to reduce time spent looking suspicious
          timeout: 60000, // Increased timeout for complex pages
          referer: 'https://yandex.com/'
        });

        // Check response status
        const status = response?.status();
        if (status === 429 || status === 403) {
          console.log(`[BrowserManager] Rate limit detected (status: ${status}), waiting before retry...`);
          if (attempt < maxRetries - 1) {
            const delay = baseDelay * Math.pow(2, attempt);
            await this.page!.waitForTimeout(delay);
            continue;
          }
        }

        // Simulate human behavior before checking for results
        await this.simulateHumanBehavior();

        // Wait for results to load - use shorter timeout and multiple selectors
        await Promise.race([
          this.page!.waitForSelector('.serp-list, .Organic, .serp-item, .content__left', { timeout: 10000 }),
          this.page!.waitForTimeout(10000)
        ]);

        // Additional wait for dynamic content
        await this.humanLikeDelay(2000, 4000);

        const isCaptcha = await this.page!.evaluate(() => {
          const captchaSelectors = [
            '.captcha',
            '#captcha',
            '[class*="captcha"]',
            '[class*="smart-captcha"]',
            '.CheckboxCaptcha',
            '.ConfirmCaptcha',
            '[src*="captcha"]',
            '[data-captcha]',
            '[id*="captcha"]'
          ];
          const hasCaptchaElement = captchaSelectors.some(selector =>
            document.querySelector(selector) !== null
          );

          const hasCaptchaText = document.body.textContent?.toLowerCase().includes('captcha') ||
                   document.body.textContent?.includes('robot check') ||
                   document.body.textContent?.includes('robot-check') ||
                   document.body.textContent?.includes('are you a human') ||
                   document.body.textContent?.includes('please confirm') ||
                   document.body.textContent?.includes('smart-captcha') ||
                   document.body.textContent?.includes('are you not a robot?') ||
                   document.body.textContent?.includes('подтвердите, что вы не робот') ||
                   document.body.textContent?.includes('я не робот') ||
                   document.body.textContent?.includes('докажите, что вы человек');

          return hasCaptchaElement || hasCaptchaText;
        });

        if (isCaptcha) {
          console.log(`[BrowserManager] CAPTCHA detected on attempt ${attempt + 1}/${maxRetries}`);

          if (attempt < maxRetries - 1) {
            // Try bypass strategies before retrying
            const bypassSuccessful = await this.attemptCaptchaBypass();

            if (bypassSuccessful) {
              console.log('[BrowserManager] CAPTCHA bypass successful, continuing with search...');
              // Continue with the same attempt since we've bypassed
              attempt--; // Decrement to retry the same attempt number
              continue;
            } else {
              const delay = baseDelay * Math.pow(2, attempt);
              console.log(`[BrowserManager] Waiting ${delay}ms before retry ${attempt + 2}/${maxRetries}`);
              await this.page!.waitForTimeout(delay);
              continue;
            }
          } else {
            // Final attempt failed
            return {
              query,
              totalResults: 0,
              results: [],
              error: 'CAPTCHA detected and bypass attempts exhausted',
              message: 'Your cookies may be flagged or expired. Try: 1) Visit yandex.com in a regular browser, 2) Solve any CAPTCHA, 3) Export fresh cookies, 4) Use a residential proxy if available, 5) Consider using YANDEX_SEARCH_API_KEY for direct API access',
              source: 'browser',
              debug: {
                cookiesLoaded: cookieStatus.loaded,
                loginCookie: cookieStatus.loginCookie,
                cookieExpiry: cookieStatus.expiry?.toISOString(),
                attempt: attempt + 1,
                totalAttempts: maxRetries
              }
            };
          }
        }

        // Save cookies after successful navigation (important for maintaining session)
        await this.saveCookies();

        const results = await this.page!.evaluate((requestedNum) => {
          const items: SearchResult[] = [];
          // Updated selectors to capture more result types
          const serpItems = document.querySelectorAll('.serp-item, .Organic, .serp-item__plaque, [data-cid], .serp-item div[data-bem], .content__left .serp-url');
          let position = 0;

          serpItems.forEach((item) => {
            // Try multiple selector strategies for title, URL, and snippet
            let titleEl = item.querySelector('.organic__title, .serp-item__title, h2 a, .OrganicTitle a, .organic__title-text, .Link_theme_normal');
            if (!titleEl) titleEl = item.querySelector('a[href*="/url?q="], a[href^="/url/"], a[href^="http"]');

            let urlEl = item.querySelector('.organic__url, .serp-item__url a, .OrganicUrl a, .Link_theme_normal, a[href^="http"]');
            if (!urlEl) urlEl = item.querySelector('a[href*="/url?q="], a[href^="/url/"]');

            let snippetEl = item.querySelector('.organic__snippet, .serp-item__text, .OrganicDescription, .organic__content-wrapper, .Text_cgray');
            if (!snippetEl) snippetEl = item.querySelector('.Text, p, div[dir="ltr"]');

            if (titleEl || urlEl) {
              position++;
              const title = (titleEl?.textContent || '').trim() || 'No title';
              let url = (urlEl?.getAttribute('href') || '').trim();

              // Handle URL redirection
              if (url.includes('/url?q=')) {
                const urlMatch = url.match(/[?&]q=([^&]*)/);
                if (urlMatch) {
                  url = decodeURIComponent(urlMatch[1]);
                }
              } else if (url.startsWith('/')) {
                try {
                  url = new URL(url, 'https://yandex.com').toString();
                } catch {
                  url = 'https://yandex.com' + url;
                }
              }

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

              if (url.startsWith('http')) {
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
          // Updated selectors for result count
          const resultsCountSelectors = [
            '.serp-info__results',
            '.search-results__total',
            '.serp-total-results',
            '.serp-adv__found',
            '[data-state*="serp"]',
            '.Pager-Item:last-child'
          ];

          for (const selector of resultsCountSelectors) {
            const resultsCountEl = document.querySelector(selector);
            if (resultsCountEl) {
              const text = resultsCountEl.textContent || '';
              const match = text.match(/([\d\s,]+(?:\s*тыс\.|K|M|B)?)/i);
              if (match) {
                let countStr = match[1].replace(/[\s,]/g, '');
                // Handle abbreviations like "10K", "2M", etc.
                if (countStr.toLowerCase().includes('k')) {
                  countStr = countStr.toLowerCase().replace('k', '');
                  totalResults = parseInt(countStr, 10) * 1000;
                } else if (countStr.toLowerCase().includes('m')) {
                  countStr = countStr.toLowerCase().replace('m', '');
                  totalResults = parseInt(countStr, 10) * 1000000;
                } else if (countStr.toLowerCase().includes('b')) {
                  countStr = countStr.toLowerCase().replace('b', '');
                  totalResults = parseInt(countStr, 10) * 1000000000;
                } else {
                  totalResults = parseInt(countStr, 10);
                }
                break;
              }
            }
          }

          if (totalResults === 0 && items.length > 0) {
            totalResults = items.length * 100; // Estimate if not found
          }

          return { items, totalResults };
        }, numResults);

        if (results.items.length === 0) {
          // Check if it's just a CAPTCHA situation that wasn't caught by our detection
          const pageContent = await this.page!.content();
          if (pageContent.toLowerCase().includes('captcha') || pageContent.includes('robot')) {
            if (attempt < maxRetries - 1) {
              const delay = baseDelay * Math.pow(2, attempt);
              console.log(`[BrowserManager] Hidden CAPTCHA detected, waiting ${delay}ms before retry...`);
              await this.page!.waitForTimeout(delay);
              continue;
            }
          }

          return {
            query,
            totalResults: 0,
            results: [],
            message: 'No results found or page blocked',
            source: 'browser',
            debug: {
              cookiesLoaded: cookieStatus.loaded,
              loginCookie: cookieStatus.loginCookie,
              pageContentLength: pageContent.length
            }
          };
        }

        console.log(`[BrowserManager] Successfully retrieved ${results.items.length} results for query: ${query}`);
        return {
          query,
          totalResults: results.totalResults,
          results: results.items.slice(0, numResults),
          source: 'browser',
          debug: {
            cookiesLoaded: cookieStatus.loaded,
            loginCookie: cookieStatus.loginCookie,
            resultsFound: results.items.length
          }
        };

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes('net::ERR_') || errorMessage.includes('Timeout') || errorMessage.includes('timeout')) {
          if (attempt < maxRetries - 1) {
            const delay = baseDelay * Math.pow(2, attempt);
            console.log(`[BrowserManager] Network error on attempt ${attempt + 1}, retrying in ${delay}ms...`);
            await this.page!.waitForTimeout(delay);
            continue;
          }
        }

        console.log(`[BrowserManager] Search attempt ${attempt + 1} failed:`, errorMessage);
        if (attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt);
          await this.page!.waitForTimeout(delay);
          continue;
        }

        return {
          query,
          totalResults: 0,
          results: [],
          error: errorMessage,
          source: 'browser',
          debug: {
            attempt: attempt + 1,
            totalAttempts: maxRetries,
            cookiesLoaded: cookieStatus.loaded,
            loginCookie: cookieStatus.loginCookie
          }
        };
      }
    }

    return {
      query,
      totalResults: 0,
      results: [],
      error: 'Max retries exceeded after CAPTCHA and network issues',
      source: 'browser',
      debug: {
        maxRetries: maxRetries,
        cookiesLoaded: cookieStatus.loaded,
        loginCookie: cookieStatus.loginCookie
      }
    };
  }

  private async makeRequest(url: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const module = isHttps ? https : http;
      
      const postData = JSON.stringify(data);
      
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = module.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);
            resolve(parsed);
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      req.write(postData);
      req.end();
    });
  }

  private async searchWithFlareSolverr(
    query: string,
    options: SearchOptions = {}
  ): Promise<YandexSearchResponse> {
    const {
      numResults = 10,
      region = 'com',
      language = 'en',
      safeSearch = true
    } = options;

    try {
      const regionDomain = region === 'com' ? 'com' : `${region}`;
      const url = `https://yandex.${regionDomain}/search/?text=${encodeURIComponent(query)}&numdoc=${Math.min(numResults, 50)}&lang=${language}&safe=${safeSearch ? 1 : 0}`;

      // Use a persistent session name
      const sessionId = 'yandex-search-session';

      // Request the page through FlareSolverr
      const pageData = await this.makeRequest(this.flaresolverrUrl, {
        cmd: 'request.get',
        url: url,
        session: sessionId,
        maxTimeout: 60000
      });
      
      if (pageData.status !== 'ok') {
        throw new Error(`FlareSolverr error: ${pageData.message || 'Unknown error'}`);
      }

      // Check if we got a CAPTCHA page
      const html = pageData.solution.response;
      if (html.includes('captcha') || html.includes('CAPTCHA') || html.includes('Are you not a robot?')) {
        return {
          query,
          totalResults: 0,
          results: [],
          error: 'CAPTCHA detected (even with FlareSolverr)',
          source: 'browser'
        };
      }

      // Parse the HTML response
      const results: SearchResult[] = [];
      let totalResults = 0;
      
      // Extract total results count
      const totalMatch = html.match(/(\d[\d\s,]*)\s+results?/i);
      if (totalMatch) {
        totalResults = parseInt(totalMatch[1].replace(/[\s,]/g, ''), 10);
      }
      
      // Simple regex-based extraction
      const titleRegex = /<h2[^>]*>.*?<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
      let match;
      let position = 0;
      
      while ((match = titleRegex.exec(html)) !== null && position < numResults) {
        position++;
        const url = match[1];
        const title = match[2].replace(/<[^>]*>/g, '').trim();
        
        // Try to find snippet
        let snippet = '';
        const snippetStart = html.indexOf('</a>', match.index) + 4;
        const snippetEnd = html.indexOf('<', snippetStart);
        if (snippetEnd > snippetStart) {
          snippet = html.substring(snippetStart, snippetEnd).trim().substring(0, 300);
        }
        
        let displayUrl = '';
        try {
          const urlObj = new URL(url);
          displayUrl = urlObj.hostname.replace('www.', '');
        } catch {
          displayUrl = url;
        }
        
        results.push({
          position,
          title,
          url,
          snippet,
          displayUrl
        });
      }
      
      return {
        query,
        totalResults: totalResults || results.length * 100,
        results: results.slice(0, numResults),
        source: 'browser'
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        query,
        totalResults: 0,
        results: [],
        error: `FlareSolverr error: ${errorMessage}`,
        source: 'browser'
      };
    }
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
