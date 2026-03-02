import type { EnhancedSearchResult } from '../types/enhanced.js';

export class RelevanceScorer {
  /**
   * Score content based on query relevance
   */
  scoreContent(content: string, query: string): number {
    const queryWords = this.normalizeWords(query);
    const contentWords = this.normalizeWords(content);
    
    let score = 0;
    const maxScore = 100;
    
    // 1. Exact phrase matching (highest weight)
    const exactMatches = this.countExactMatches(content, query);
    score += Math.min(exactMatches * 20, 40); // Max 40 points
    
    // 2. Word overlap
    const overlap = this.calculateOverlap(queryWords, contentWords);
    score += overlap * 25; // Max 25 points
    
    // 3. Keyword density (avoid keyword stuffing)
    const density = this.calculateKeywordDensity(contentWords, queryWords);
    score += Math.min(density * 100, 15); // Max 15 points
    
    // 4. Content quality signals
    const qualityScore = this.assessContentQuality(content);
    score += qualityScore; // Max 10 points
    
    // 5. Freshness bonus (if dates present)
    const freshnessScore = this.assessFreshness(content);
    score += freshnessScore; // Max 10 points
    
    return Math.min(score, maxScore);
  }

  /**
   * Prioritize and reorder results based on multiple factors
   */
  prioritizePages(
    results: EnhancedSearchResult[], 
    query: string
  ): EnhancedSearchResult[] {
    // Score each result
    const scoredResults = results.map(result => {
      const contentScore = result.fetched_content 
        ? this.scoreContent(result.fetched_content.full_text, query)
        : 0;
      
      // Combine with original position (Yandex ranking)
      const positionScore = Math.max(0, 20 - result.position); // Top results get bonus
      
      // Domain authority heuristic
      const domainScore = this.scoreDomain(result.displayUrl || result.url);
      
      const totalScore = contentScore + positionScore + domainScore;
      
      return {
        ...result,
        relevance_score: totalScore,
      };
    });
    
    // Sort by relevance score (descending)
    scoredResults.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
    
    // Ensure diversity: don't have more than 2 results from same domain
    return this.ensureDiversity(scoredResults);
  }

  /**
   * Ensure diversity of sources
   */
  private ensureDiversity(results: EnhancedSearchResult[]): EnhancedSearchResult[] {
    const domainCounts: Map<string, number> = new Map();
    const diverse: EnhancedSearchResult[] = [];
    
    for (const result of results) {
      const domain = this.extractDomain(result.url);
      const count = domainCounts.get(domain) || 0;
      
      if (count < 2) {
        diverse.push(result);
        domainCounts.set(domain, count + 1);
      } else {
        // Still include but mark as lower priority
        diverse.push({
          ...result,
          relevance_score: (result.relevance_score || 0) * 0.8,
        });
      }
    }
    
    // Re-sort after diversity adjustment
    diverse.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
    
    return diverse;
  }

  private normalizeWords(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2) // Filter out short words
      .filter(w => !this.isStopWord(w));
  }

  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
      'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that',
      'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
    ]);
    return stopWords.has(word);
  }

  private countExactMatches(content: string, query: string): number {
    const lowerContent = content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const regex = new RegExp(lowerQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = lowerContent.match(regex);
    return matches ? matches.length : 0;
  }

  private calculateOverlap(queryWords: string[], contentWords: string[]): number {
    const querySet = new Set(queryWords);
    const contentSet = new Set(contentWords);
    
    const intersection = new Set([...querySet].filter(x => contentSet.has(x)));
    const union = new Set([...querySet, ...contentSet]);
    
    return intersection.size / union.size;
  }

  private calculateKeywordDensity(contentWords: string[], queryWords: string[]): number {
    if (contentWords.length === 0) return 0;
    
    const querySet = new Set(queryWords);
    const matches = contentWords.filter(w => querySet.has(w)).length;
    
    return matches / contentWords.length;
  }

  private assessContentQuality(content: string): number {
    let score = 0;
    
    // Length check (quality content usually 300+ words)
    const wordCount = content.split(/\s+/).length;
    if (wordCount > 500) score += 3;
    else if (wordCount > 300) score += 2;
    else if (wordCount > 100) score += 1;
    
    // Structure check (headers, lists)
    if (content.includes('##') || content.includes('**')) score += 2;
    if (content.match(/^\s*[-*]\s/m)) score += 2; // Lists
    if (content.match(/^\s*\d+\.\s/m)) score += 2; // Numbered lists
    
    // Depth indicators
    if (content.includes('however') || content.includes('although')) score += 1;
    if (content.includes('example') || content.includes('for instance')) score += 1;
    
    return Math.min(score, 10);
  }

  private assessFreshness(content: string): number {
    // Look for date patterns
    const datePatterns = [
      /\b(20\d{2})\b/g, // Years 2000-2099
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/gi,
      /\b\d{1,2}\/\d{1,2}\/(20)?\d{2}\b/g,
    ];
    
    let dateMatches = 0;
    for (const pattern of datePatterns) {
      const matches = content.match(pattern);
      if (matches) dateMatches += matches.length;
    }
    
    // Check for recent year mentions
    const currentYear = new Date().getFullYear();
    const recentYearPattern = new RegExp(`\\b(${currentYear}|${currentYear - 1})\\b`, 'g');
    const recentYears = content.match(recentYearPattern);
    
    if (recentYears) {
      return Math.min(10, recentYears.length * 2);
    }
    
    return Math.min(5, dateMatches);
  }

  private scoreDomain(displayUrl: string | undefined): number {
    if (!displayUrl) return 0;
    
    // High authority domains
    const highAuthority = ['wikipedia.org', 'edu', 'gov', 'medium.com', 'github.com'];
    if (highAuthority.some(d => displayUrl.includes(d))) return 10;
    
    // Medium authority
    const mediumAuthority = ['stackoverflow.com', 'reddit.com', 'quora.com', 'news'];
    if (mediumAuthority.some(d => displayUrl.includes(d))) return 5;
    
    // Blog platforms
    const blogs = ['blogspot.com', 'wordpress.com', 'substack.com'];
    if (blogs.some(d => displayUrl.includes(d))) return 2;
    
    return 0;
  }

  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return url;
    }
  }
}

export default RelevanceScorer;
