import { MCPTool } from 'mcp-framework';
import { z } from 'zod';
import BrowserManager from '../browser/BrowserManager.js';
import ContentExtractor from '../extractor/ContentExtractor.js';
import RelevanceScorer from '../scorer/RelevanceScorer.js';
import LLMContextFormatter from '../formatter/LLMContextFormatter.js';
import ContentCache from '../cache/ContentCache.js';
import type { 
  YandexSearchEnhancedInput,
  EnhancedSearchResult
} from '../types/enhanced.js';
import type { SearchResult as BaseSearchResult } from '../browser/BrowserManager.js';

export class YandexSearchEnhancedTool extends MCPTool<YandexSearchEnhancedInput> {
  name = 'yandex_search_enhanced';
  description = 'Search Yandex, fetch page content, and provide structured context for LLM consumption. Returns synthesized information from multiple sources with source attribution.';

  schema = {
    query: {
      type: z.string(),
      description: 'The search query to execute on Yandex',
    },
    numResults: {
      type: z.number().optional().default(10),
      description: 'Number of search results to return (default: 10, max: 20)',
    },
    region: {
      type: z.string().optional().default('com'),
      description: 'Yandex region (com, ru, tr, etc.)',
    },
    language: {
      type: z.string().optional().default('en'),
      description: 'Language code (en, ru, etc.)',
    },
    safeSearch: {
      type: z.boolean().optional().default(true),
      description: 'Enable safe search filtering',
    },
    fetch_content: {
      type: z.boolean().optional().default(true),
      description: 'Whether to fetch and extract content from result pages',
    },
    max_pages: {
      type: z.number().optional().default(3),
      description: 'Maximum number of pages to fetch content from (default: 3, max: 10)',
    },
    max_tokens_per_page: {
      type: z.number().optional().default(3000),
      description: 'Maximum tokens per page (default: 3000)',
    },
    summarize: {
      type: z.boolean().optional().default(true),
      description: 'Generate summaries of fetched content',
    },
    extract_key_points: {
      type: z.boolean().optional().default(true),
      description: 'Extract key points from content',
    },
    analysis_level: {
      type: z.enum(['basic', 'detailed', 'comprehensive']).optional().default('detailed'),
      description: 'Depth of content analysis: basic (fast), detailed (balanced), comprehensive (thorough)',
    },
    context_format: {
      type: z.enum(['raw', 'summarized', 'synthesized', 'qa_ready']).optional().default('synthesized'),
      description: 'Output format: raw (full content), summarized (condensed), synthesized (cross-source analysis), qa_ready (question-answer format)',
    },
  };

  private browserManager: BrowserManager;
  private contentExtractor: ContentExtractor;
  private relevanceScorer: RelevanceScorer;
  private contextFormatter: LLMContextFormatter;
  private cache: ContentCache;

  constructor() {
    super();
    this.browserManager = BrowserManager.getInstance();
    this.contentExtractor = new ContentExtractor();
    this.relevanceScorer = new RelevanceScorer();
    this.contextFormatter = new LLMContextFormatter();
    this.cache = new ContentCache({
      maxSize: 100,
      defaultTtlMs: 24 * 60 * 60 * 1000, // 24 hours
    });
  }

  async execute(input: YandexSearchEnhancedInput) {
    const startTime = Date.now();
    
    try {
      // 1. Initialize browser
      await this.browserManager.initialize();
      const page = await this.browserManager.getPage();

      // 2. Perform Yandex search
      console.log(`[YandexEnhanced] Searching for: ${input.query}`);
      const searchResults = await this.browserManager.searchYandex(input.query, {
        numResults: Math.min(input.numResults || 10, 20),
        region: input.region,
        language: input.language,
        safeSearch: input.safeSearch,
      });

      if (searchResults.error) {
        return {
          error: searchResults.error,
          query: input.query,
        };
      }

      // 3. Convert to enhanced results
      let enhancedResults: EnhancedSearchResult[] = searchResults.results.map((r: BaseSearchResult, index: number) => ({
        ...r,
        position: index + 1,
      }));

      // 4. Fetch content if enabled
      if (input.fetch_content !== false) {
        const maxPages = Math.min(input.max_pages || 3, 10);
        console.log(`[YandexEnhanced] Fetching content from ${maxPages} pages...`);
        
        enhancedResults = await this.fetchAndEnrichResults(
          enhancedResults,
          page,
          maxPages,
          input.max_tokens_per_page || 3000,
          input.query
        );

        // 5. Score and prioritize
        console.log('[YandexEnhanced] Scoring and prioritizing results...');
        enhancedResults = this.relevanceScorer.prioritizePages(enhancedResults, input.query);

        // 6. Format for LLM
        console.log('[YandexEnhanced] Formatting context for LLM...');
        const formattedContext = this.contextFormatter.formatForLLM(
          enhancedResults,
          input.query,
          8000
        );

        // 7. Present based on context_format
        const output = this.presentOutput(formattedContext, enhancedResults, input);
        
        const totalTime = Date.now() - startTime;
        
        return {
          ...output,
          metadata: {
            query: input.query,
            total_results: searchResults.totalResults,
            pages_fetched: enhancedResults.filter(r => r.fetched_content).length,
            successful_extractions: enhancedResults.filter(
              r => r.fetched_content?.metadata.status === 'success'
            ).length,
            cache_stats: this.cache.getStats(),
            total_time_ms: totalTime,
            analysis_level: input.analysis_level,
            context_format: input.context_format,
          },
        };
      }

      // Return basic search results if fetch_content is disabled
      return {
        query: input.query,
        total_results: searchResults.totalResults,
        results: enhancedResults,
        note: 'Content fetching disabled. Enable fetch_content for full analysis.',
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[YandexEnhanced] Error:', errorMessage);
      
      return {
        error: errorMessage,
        query: input.query,
      };
    }
  }

  /**
   * Fetch and enrich search results with content
   */
  private async fetchAndEnrichResults(
    results: EnhancedSearchResult[],
    page: any,
    maxPages: number,
    maxTokens: number,
    query: string
  ): Promise<EnhancedSearchResult[]> {
    const enriched: EnhancedSearchResult[] = [];
    let fetchedCount = 0;

    for (const result of results) {
      if (fetchedCount >= maxPages) {
        // Add remaining results without fetching
        enriched.push(result);
        continue;
      }

      // Check cache first
      const cached = this.cache.get(result.url);
      if (cached) {
        console.log(`[YandexEnhanced] Cache hit: ${result.url}`);
        enriched.push({
          ...result,
          fetched_content: cached,
        });
        fetchedCount++;
        continue;
      }

      // Fetch content
      try {
        console.log(`[YandexEnhanced] Fetching: ${result.url}`);
        const content = await this.contentExtractor.extractFromUrl(
          result.url,
          query,
          page,
          {
            maxTokens,
            extractImages: false,
            extractLinks: false,
            prioritizeMainContent: true,
            removeBoilerplate: true,
          }
        );

        // Cache successful fetches
        if (content.metadata.status === 'success') {
          this.cache.set(result.url, content, query);
          fetchedCount++;
        }

        enriched.push({
          ...result,
          fetched_content: content,
        });

        // Polite delay between fetches
        if (fetchedCount < maxPages) {
          await page.waitForTimeout(1000);
        }

      } catch (error) {
        console.error(`[YandexEnhanced] Failed to fetch ${result.url}:`, error);
        enriched.push({
          ...result,
          fetched_content: {
            full_text: '',
            metadata: {
              word_count: 0,
              estimated_tokens: 0,
              fetch_time_ms: 0,
              content_type: 'other',
              status: 'failed',
              error: error instanceof Error ? error.message : 'Fetch failed',
            },
          },
        });
      }
    }

    return enriched;
  }

  /**
   * Present output based on context format
   */
  private presentOutput(
    formattedContext: any,
    results: EnhancedSearchResult[],
    input: YandexSearchEnhancedInput
  ): any {
    const format = input.context_format || 'synthesized';

    switch (format) {
      case 'raw':
        return {
          query: input.query,
          results: results.map(r => ({
            title: r.title,
            url: r.url,
            content: r.fetched_content?.full_text || 'Not fetched',
            metadata: r.fetched_content?.metadata,
          })),
        };

      case 'summarized':
        return {
          query: input.query,
          summary: formattedContext.summary,
          results: results
            .filter(r => r.fetched_content?.metadata.status === 'success')
            .map(r => ({
              title: r.title,
              url: r.url,
              snippet: r.snippet,
              key_points: r.fetched_content?.key_points || [],
              word_count: r.fetched_content?.metadata.word_count,
            })),
        };

      case 'qa_ready':
        return {
          query: input.query,
          question: `What information is available about "${input.query}"?`,
          answer: formattedContext.synthesized_knowledge,
          supporting_evidence: formattedContext.key_findings.map((kf: any) => ({
            point: kf.finding,
            source: kf.source,
            confidence: kf.confidence,
          })),
          sources: formattedContext.source_references,
        };

      case 'synthesized':
      default:
        return formattedContext;
    }
  }
}

export default YandexSearchEnhancedTool;
