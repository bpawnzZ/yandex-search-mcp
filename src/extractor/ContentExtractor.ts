import { Page } from 'playwright-core';
import type {
  FetchedContent,
  ContentMetadata,
  ExtractionConfig,
  ImageData
} from '../types/enhanced.js';

export class ContentExtractor {
  private defaultConfig: ExtractionConfig = {
    maxTokens: 4000,
    extractImages: false,
    extractLinks: false,
    prioritizeMainContent: true,
    removeBoilerplate: true,
  };

  async extractFromUrl(
    url: string,
    query: string,
    page: Page,
    config: Partial<ExtractionConfig> = {}
  ): Promise<FetchedContent> {
    const mergedConfig = { ...this.defaultConfig, ...config };
    const startTime = Date.now();

    try {
      // Navigate to page with enhanced error handling
      await page.goto(url, {
        waitUntil: 'networkidle', // Changed to networkidle for better content loading
        timeout: 45000 // Increased timeout for complex pages
      });

      // Smart wait for content to load - check for content presence
      await this.smartWaitForContent(page, 5000);

      // Extract main content with enhanced algorithms
      const fullText = await this.extractMainContent(page);

      // Detect content type with improved accuracy
      const contentType = await this.detectContentType(page);

      // Extract images if enabled
      let images: ImageData[] | undefined;
      if (mergedConfig.extractImages) {
        images = await this.extractImages(page);
      }

      // Extract links if enabled
      let extracted_links: string[] | undefined;
      if (mergedConfig.extractLinks) {
        extracted_links = await this.extractLinks(page);
      }

      // Calculate metadata with improved token estimation
      const wordCount = fullText.trim().split(/\s+/).filter(word => word.length > 0).length;
      const estimatedTokens = this.estimateTokens(fullText); // More accurate token estimation

      // Truncate if needed with improved algorithm
      let truncated_text: string | undefined;
      if (estimatedTokens > mergedConfig.maxTokens) {
        truncated_text = this.truncateToTokens(fullText, mergedConfig.maxTokens);
      }

      const fetchTime = Date.now() - startTime;

      return {
        full_text: fullText,
        truncated_text,
        summary: this.generateSummary(fullText, query), // Add content summary
        key_points: this.extractKeyPoints(fullText, query), // Add key points extraction
        metadata: {
          word_count: wordCount,
          estimated_tokens: truncated_text
            ? mergedConfig.maxTokens
            : estimatedTokens,
          fetch_time_ms: fetchTime,
          content_type: contentType,
          status: 'success',
        },
        extracted_links,
        images,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const fetchTime = Date.now() - startTime;

      // Try fallback extraction if possible
      try {
        const fallbackContent = await this.fallbackExtraction(page);
        const wordCount = fallbackContent.trim().split(/\s+/).filter(word => word.length > 0).length;
        const estimatedTokens = this.estimateTokens(fallbackContent);

        return {
          full_text: fallbackContent,
          metadata: {
            word_count: wordCount,
            estimated_tokens: estimatedTokens,
            fetch_time_ms: fetchTime,
            content_type: 'other',
            status: 'partial_success', // Changed status to indicate partial success
            error: `Primary extraction failed: ${errorMessage}. Fallback used.`,
          },
        };
      } catch {
        // If even fallback fails, return empty content with error
        return {
          full_text: '',
          metadata: {
            word_count: 0,
            estimated_tokens: 0,
            fetch_time_ms: fetchTime,
            content_type: 'other',
            status: 'failed',
            error: errorMessage,
          },
        };
      }
    }
  }

  /**
   * Smart wait for content to load based on content presence
   */
  private async smartWaitForContent(page: Page, timeout: number = 5000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const hasContent = await page.evaluate(() => {
        const body = document.body;
        const html = document.documentElement;

        // Check if body has substantial content
        const bodyText = body ? body.innerText.trim() : '';
        const contentLength = bodyText.length;

        // Check for common content elements
        const hasContentElements = document.querySelector('article, main, .content, .post, .entry, .article, [role="main"]') !== null;
        const hasTextContent = contentLength > 100; // At least 100 characters

        return hasContentElements || hasTextContent;
      });

      if (hasContent) {
        // Additional small wait for dynamic content
        await page.waitForTimeout(1000);
        return;
      }

      await page.waitForTimeout(200);
    }

    // Even if content isn't detected, wait a bit more for slow-loading pages
    await page.waitForTimeout(2000);
  }

  /**
   * More accurate token estimation using common tokenization patterns
   */
  private estimateTokens(text: string): number {
    if (!text || text.length === 0) return 0;

    // Split on common token boundaries: spaces, punctuation, special characters
    // This is a more accurate estimation than the simple 1.3 multiplier
    const tokens = text
      .replace(/[^\w\s]/g, ' $& ') // Add spaces around punctuation
      .split(/\s+/)
      .filter(token => token.length > 0);

    // Adjust for common patterns:
    // - Short words (1-2 chars) often get merged with punctuation: multiply by 0.7
    // - Longer text often has more complex tokens: multiply by 1.1
    const shortWordRatio = tokens.filter(token => token.length <= 2).length / tokens.length;
    const baseEstimate = tokens.length;

    if (shortWordRatio > 0.5) {
      return Math.ceil(baseEstimate * 0.7);
    } else {
      return Math.ceil(baseEstimate * 1.1);
    }
  }

  /**
   * Generate a brief summary of the content
   */
  private generateSummary(text: string, query: string): string {
    if (!text || text.length === 0) return '';

    // Get first few sentences or up to 200 characters
    const sentences = text.split(/[.!?]+/);
    let summary = '';

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed.length > 0) {
        summary += trimmed + '. ';
        if (summary.length >= 200) break;
      }
    }

    return summary.substring(0, 300).trim(); // Limit to 300 chars
  }

  /**
   * Extract key points from content related to the query
   */
  private extractKeyPoints(text: string, query: string): string[] {
    if (!text || text.length === 0) return [];

    const sentences = text.split(/[.!?]+/);
    const queryKeywords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    const keyPoints: string[] = [];

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed.length > 20 && trimmed.length < 200) { // Good length for key points
        // Check if sentence contains query-related keywords
        const containsKeyword = queryKeywords.some(keyword =>
          trimmed.toLowerCase().includes(keyword)
        );

        if (containsKeyword || keyPoints.length < 3) { // Include up to 3 general points
          keyPoints.push(trimmed + '.');
          if (keyPoints.length >= 5) break; // Limit to 5 key points
        }
      }
    }

    return keyPoints;
  }

  /**
   * Fallback extraction method for when primary extraction fails
   */
  private async fallbackExtraction(page: Page): Promise<string> {
    return page.evaluate(() => {
      // Get the most likely content area
      let contentElement = document.querySelector('article, main, .content, .post, .entry, .article, [role="main"]');

      if (!contentElement) {
        // Try body without common non-content elements
        const bodyClone = document.body.cloneNode(true) as HTMLElement;
        const nonContent = bodyClone.querySelectorAll('nav, header, footer, aside, script, style, .ads, .advertisement, .sidebar, .menu, .navigation');
        nonContent.forEach(el => el.remove());
        return (bodyClone.innerText || '').substring(0, 2000); // Limit to prevent huge content
      }

      return (contentElement as HTMLElement).innerText.substring(0, 2000);
    });
  }

  private async extractMainContent(page: Page): Promise<string> {
    // Strategy 1: Try structured content (article, main, content areas)
    const structuredContent = await page.evaluate(() => {
      // Look for semantic HTML5 elements and common content classes
      const selectors = [
        'article',
        'main',
        '[role="main"]',
        '.content', '.main-content', '#main-content',
        '.post', '.entry', '.article', '.blog-post',
        '.post-content', '.entry-content', '.article-content',
        '[class*="content"]', '[class*="article"]', '[class*="post"]'
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          const text = (element as HTMLElement).innerText || '';
          if (text.length > 500) { // Substantial content found
            return text;
          }
        }
      }
      return '';
    });

    if (structuredContent && structuredContent.length > 500) {
      return this.cleanText(structuredContent);
    }

    // Strategy 2: Content density algorithm
    const densityContent = await page.evaluate(() => {
      // Remove common non-content elements
      const clone = document.body.cloneNode(true) as HTMLElement;
      const nonContentSelectors = [
        'script', 'style', 'nav', 'header', 'footer', 'aside',
        '.ads', '.advertisement', '.sidebar', '.menu', '.navigation',
        '.social', '.share', '.comments', '.comment', '.related',
        '[class*="ad"]', '[id*="ad"]', '[class*="social"]', '[class*="share"]'
      ];

      nonContentSelectors.forEach(selector => {
        const elements = clone.querySelectorAll(selector);
        elements.forEach(el => el.remove());
      });

      // Calculate content density for different sections
      const sections = Array.from(clone.children);
      let bestSection = '';
      let bestDensity = 0;

      for (const section of sections) {
        const text = section.textContent || '';
        const textLength = text.length;
        const linkCount = section.querySelectorAll('a').length;
        const linkTextLength = Array.from(section.querySelectorAll('a'))
          .reduce((sum, a) => sum + (a.textContent?.length || 0), 0);

        // Calculate density: ratio of non-link text to total text
        const nonLinkTextLength = textLength - linkTextLength;
        const density = nonLinkTextLength / (textLength || 1);

        if (nonLinkTextLength > 300 && density > 0.7 && density > bestDensity) {
          bestDensity = density;
          bestSection = text;
        }
      }

      // If no dense section found, use the whole body
      return bestSection || clone.innerText;
    });

    if (densityContent && densityContent.length > 500) {
      return this.cleanText(densityContent);
    }

    // Strategy 3: Fallback to body with comprehensive cleaning
    const bodyContent = await page.evaluate(() => {
      const clone = document.body.cloneNode(true) as HTMLElement;
      const allNonContent = clone.querySelectorAll('script, style, nav, header, footer, aside, .ads, .advertisement, .sidebar, .menu, .navigation, .social, .share, .comments, [class*="ad"], [id*="ad"], [class*="social"], [class*="share"]');
      allNonContent.forEach(el => el.remove());
      return clone.innerText;
    });

    return this.cleanText(bodyContent);
  }

  private async detectContentType(page: Page): Promise<ContentMetadata['content_type']> {
    return page.evaluate(() => {
      // Enhanced content type detection with more patterns
      const url = document.URL.toLowerCase();
      const title = document.title.toLowerCase();
      const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content')?.toLowerCase() || '';

      // Check for article indicators with better accuracy
      if (document.querySelector('article, [typeof="Article"], .article, .post, .entry, .blog-post, .story, .news-article, [data-type="article"]')) {
        return 'article';
      }

      // Check for product indicators
      if (document.querySelector('[typeof="Product"], .product, .product-detail, [data-product], .product-page, .item, .sku, .price, .buy-now')) {
        return 'product';
      }

      // Check for forum indicators
      if (document.querySelector('.forum, .thread, .post-list, .discussion, .topic, .reply, .message, .forum-thread, .bbpress')) {
        return 'forum';
      }

      // Check for blog indicators
      if (document.querySelector('.blog-post, .entry, .blog-entry, .post, .wp-post, .hentry, .blog-article') ||
          url.includes('blog') || url.includes('post') || url.includes('/archives/')) {
        return 'blog';
      }

      // Check for documentation
      if (document.querySelector('.documentation, .docs, .api-docs, .readme, .manual, .guide, .tutorial') ||
          url.includes('docs.') || url.includes('/docs/') || url.includes('documentation') || url.includes('manual')) {
        return 'documentation';
      }

      // Check for news
      if (document.querySelector('.news, .article, .story, .breaking-news, .headline, .news-story') ||
          url.includes('news') || url.includes('article') || url.includes('/stories/')) {
        return 'article';
      }

      // Check for video/media content
      if (document.querySelector('video, .video-player, .media, .player, .embed') ||
          url.includes('video') || url.includes('watch') || url.includes('movie')) {
        return 'other'; // Could be extended for media type
      }

      // Check for academic/research
      if (url.includes('scholar') || url.includes('research') || url.includes('academic') || url.includes('paper')) {
        return 'documentation';
      }

      // Use URL patterns and title for additional clues
      if (url.includes('shop') || url.includes('store') || url.includes('product') || url.includes('buy') || url.includes('cart')) {
        return 'product';
      }

      if (url.includes('forum') || url.includes('community') || url.includes('discuss')) {
        return 'forum';
      }

      return 'other';
    });
  }

  private async extractImages(page: Page): Promise<ImageData[]> {
    return page.evaluate(() => {
      const images = document.querySelectorAll('img[src]');
      const data: ImageData[] = [];

      // Sort images by relevance (size and position)
      const imageDataList = Array.from(images).map(img => {
        const rect = img.getBoundingClientRect();
        const src = img.src;
        const alt = img.alt || '';
        const title = img.title || '';
        const width = img.naturalWidth || rect.width;
        const height = img.naturalHeight || rect.height;

        // Calculate relevance score
        const area = width * height;
        const isLargeEnough = area > 5000; // Minimum 5000 pixels
        const isNotIcon = width > 50 && height > 50; // Minimum dimensions

        return {
          img,
          src,
          alt,
          title,
          width,
          height,
          area,
          isLargeEnough,
          isNotIcon,
          relevance: area * (isLargeEnough ? 1 : 0.1) * (isNotIcon ? 1 : 0.2)
        };
      });

      // Sort by relevance and take top images
      const sortedImages = imageDataList
        .filter(item => item.isLargeEnough && item.isNotIcon)
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, 5); // Take top 5

      for (const item of sortedImages) {
        // Get surrounding context
        const parent = item.img.closest('p, div, figure, article, section');
        const context = parent ? (parent.textContent || '').substring(0, 200) : '';

        // Get image caption if available
        const figcaption = item.img.closest('figure')?.querySelector('figcaption');
        const caption = figcaption ? (figcaption.textContent || '') : '';

        data.push({
          src: item.src,
          alt: item.alt || caption || item.title,
          context: context
        });
      }

      return data;
    });
  }

  private async extractLinks(page: Page): Promise<string[]> {
    return page.evaluate(() => {
      // Get all links but prioritize those in main content areas
      const allLinks = document.querySelectorAll('a[href]');
      const contentArea = document.querySelector('article, main, .content, .post, .entry, .article, [role="main"]');

      const urlScores: Map<string, number> = new Map();
      const urls: string[] = [];

      allLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (!href || !href.startsWith('http')) return;

        // Normalize URL
        try {
          const normalizedUrl = new URL(href).href;
          if (urlScores.has(normalizedUrl)) {
            // Increase score if found in content area
            if (contentArea && contentArea.contains(link)) {
              urlScores.set(normalizedUrl, (urlScores.get(normalizedUrl) || 0) + 2);
            } else {
              urlScores.set(normalizedUrl, (urlScores.get(normalizedUrl) || 0) + 1);
            }
          } else {
            // Check if link is in content area
            const score = contentArea && contentArea.contains(link) ? 2 : 1;
            urlScores.set(normalizedUrl, score);
            urls.push(normalizedUrl);
          }
        } catch {
          // Skip invalid URLs
        }
      });

      // Sort URLs by score and return top 10
      return urls
        .sort((a, b) => (urlScores.get(b) || 0) - (urlScores.get(a) || 0))
        .slice(0, 10);
    });
  }

  private cleanText(text: string): string {
    if (!text) return '';

    return text
      // Remove extra whitespace while preserving structure
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      // Remove common non-content patterns
      .replace(/Copyright \d{4}.*?\n/g, '')
      .replace(/All rights reserved.*?\n/g, '')
      .replace(/\s+Read more\s*/g, ' ')
      .replace(/\s+Continue reading\s*/g, ' ')
      .replace(/\s+Click here\s*/g, ' ')
      // Clean up repeated characters
      .replace(/([.!])\1+/g, '$1')
      .trim();
  }

  private truncateToTokens(text: string, maxTokens: number): string {
    if (!text || maxTokens <= 0) return text;

    // More accurate token truncation
    const tokens = text
      .replace(/[^\w\s]/g, ' $& ') // Add spaces around punctuation
      .split(/\s+/)
      .filter(token => token.length > 0);

    if (tokens.length <= maxTokens) {
      return text;
    }

    // Find the best truncation point (try to end at sentence boundary)
    const truncatedTokens = tokens.slice(0, maxTokens);
    let truncatedText = truncatedTokens.join(' ');

    // Look for the last sentence end within the last portion of the text
    const lastSentenceEnd = truncatedText.lastIndexOf('.', truncatedText.length * 0.8);
    if (lastSentenceEnd > truncatedText.length * 0.3) { // Only if it's not too early
      truncatedText = truncatedText.substring(0, lastSentenceEnd + 1);
    }

    return truncatedText + '...';
  }
}

export default ContentExtractor;
