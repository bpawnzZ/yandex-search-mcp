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
      // Navigate to page
      await page.goto(url, { 
        waitUntil: 'domcontentloaded', 
        timeout: 30000 
      });
      
      // Wait for content to load
      await page.waitForTimeout(2000);
      
      // Extract main content
      const fullText = await this.extractMainContent(page);
      
      // Detect content type
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
      
      // Calculate metadata
      const wordCount = fullText.split(/\s+/).length;
      const estimatedTokens = Math.ceil(wordCount * 1.3); // Rough estimate
      
      // Truncate if needed
      let truncated_text: string | undefined;
      if (estimatedTokens > mergedConfig.maxTokens) {
        truncated_text = this.truncateToTokens(fullText, mergedConfig.maxTokens);
      }
      
      const fetchTime = Date.now() - startTime;
      
      return {
        full_text: fullText,
        truncated_text,
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
      return {
        full_text: '',
        metadata: {
          word_count: 0,
          estimated_tokens: 0,
          fetch_time_ms: Date.now() - startTime,
          content_type: 'other',
          status: 'failed',
          error: errorMessage,
        },
      };
    }
  }

  private async extractMainContent(page: Page): Promise<string> {
    // Strategy 1: Try article tag
    const articleContent = await page.evaluate(() => {
      const article = document.querySelector('article');
      return article ? (article as HTMLElement).innerText : '';
    });
    
    if (articleContent && articleContent.length > 500) {
      return this.cleanText(articleContent);
    }
    
    // Strategy 2: Try main content area
    const mainContent = await page.evaluate(() => {
      const main = document.querySelector('main, [role="main"], .main-content, #main-content');
      return main ? (main as HTMLElement).innerText : '';
    });
    
    if (mainContent && mainContent.length > 500) {
      return this.cleanText(mainContent);
    }
    
    // Strategy 3: Heuristic - largest text block
    const bodyContent = await page.evaluate(() => {
      // Remove script, style, nav, header, footer
      const clone = document.body.cloneNode(true) as HTMLElement;
      const toRemove = clone.querySelectorAll('script, style, nav, header, footer, aside, .ads, .advertisement, .sidebar');
      toRemove.forEach(el => el.remove());
      return clone.innerText;
    });
    
    return this.cleanText(bodyContent);
  }

  private async detectContentType(page: Page): Promise<ContentMetadata['content_type']> {
    return page.evaluate(() => {
      // Check for article indicators
      if (document.querySelector('article, [typeof="Article"], .article, .post')) {
        return 'article';
      }
      
      // Check for product indicators
      if (document.querySelector('[typeof="Product"], .product, .product-detail, [data-product]')) {
        return 'product';
      }
      
      // Check for forum indicators
      if (document.querySelector('.forum, .thread, .post-list, .discussion')) {
        return 'forum';
      }
      
      // Check for blog indicators
      if (document.querySelector('.blog-post, .entry, .blog-entry')) {
        return 'blog';
      }
      
      // Check for documentation
      if (document.querySelector('.documentation, .docs, .api-docs') || 
          document.URL.includes('docs.') ||
          document.URL.includes('/docs/')) {
        return 'documentation';
      }
      
      return 'other';
    });
  }

  private async extractImages(page: Page): Promise<ImageData[]> {
    return page.evaluate(() => {
      const images = document.querySelectorAll('img');
      const data: ImageData[] = [];
      
      images.forEach(img => {
        const src = img.src;
        const alt = img.alt || '';
        
        // Skip small images (likely icons)
        if (img.width > 100 && img.height > 100) {
          // Get surrounding context
          const parent = img.closest('p, div, figure, article');
          const context = parent ? parent.textContent?.substring(0, 200) : '';
          
          data.push({ src, alt, context });
        }
      });
      
      return data.slice(0, 5); // Limit to 5 images
    });
  }

  private async extractLinks(page: Page): Promise<string[]> {
    return page.evaluate(() => {
      const links = document.querySelectorAll('a[href]');
      const urls: string[] = [];
      
      links.forEach(link => {
        const href = link.getAttribute('href');
        if (href && href.startsWith('http') && !urls.includes(href)) {
          urls.push(href);
        }
      });
      
      return urls.slice(0, 10); // Limit to 10 links
    });
  }

  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
  }

  private truncateToTokens(text: string, maxTokens: number): string {
    // Rough estimate: 1 token ≈ 0.75 words
    const maxWords = Math.floor(maxTokens * 0.75);
    const words = text.split(/\s+/);
    
    if (words.length <= maxWords) {
      return text;
    }
    
    // Find last complete sentence within limit
    const truncated = words.slice(0, maxWords).join(' ');
    const lastSentenceEnd = truncated.lastIndexOf('.');
    
    if (lastSentenceEnd > truncated.length * 0.8) {
      return truncated.substring(0, lastSentenceEnd + 1);
    }
    
    return truncated + '...';
  }
}

export default ContentExtractor;
