import type { CacheEntry, FetchedContent } from '../types/enhanced.js';

interface CacheOptions {
  maxSize?: number;          // Max number of entries
  defaultTtlMs?: number;     // Default TTL in milliseconds
  domainTtls?: Map<string, number>; // Domain-specific TTLs
}

export class ContentCache {
  private cache: Map<string, CacheEntry>;
  private maxSize: number;
  private defaultTtlMs: number;
  private domainTtls: Map<string, number>;
  private accessOrder: string[]; // Track LRU

  constructor(options: CacheOptions = {}) {
    this.cache = new Map();
    this.maxSize = options.maxSize || 100;
    this.defaultTtlMs = options.defaultTtlMs || 24 * 60 * 60 * 1000; // 24 hours
    this.domainTtls = options.domainTtls || this.getDefaultDomainTtls();
    this.accessOrder = [];
  }

  /**
   * Get default TTLs for different content types
   */
  private getDefaultDomainTtls(): Map<string, number> {
    const ttlMap = new Map<string, number>();
    
    // News sites: 1 hour
    const newsSites = ['news', 'bbc', 'cnn', 'reuters', 'ap.org', 'npr.org'];
    for (const site of newsSites) {
      ttlMap.set(site, 60 * 60 * 1000); // 1 hour
    }
    
    // Social media: 30 minutes
    const socialSites = ['reddit.com', 'twitter.com', 'x.com', 'facebook.com'];
    for (const site of socialSites) {
      ttlMap.set(site, 30 * 60 * 1000); // 30 minutes
    }
    
    // Reference/docs: 24 hours
    const referenceSites = ['wikipedia.org', 'docs.', 'documentation'];
    for (const site of referenceSites) {
      ttlMap.set(site, 24 * 60 * 60 * 1000); // 24 hours
    }
    
    // E-commerce: 6 hours
    const ecommerceSites = ['amazon', 'ebay', 'shopify'];
    for (const site of ecommerceSites) {
      ttlMap.set(site, 6 * 60 * 60 * 1000); // 6 hours
    }
    
    return ttlMap;
  }

  /**
   * Get content from cache if valid
   */
  get(url: string): FetchedContent | null {
    const entry = this.cache.get(url);
    
    if (!entry) {
      return null;
    }
    
    // Check if expired
    const now = Date.now();
    const age = now - entry.timestamp;
    
    if (age > entry.ttl) {
      // Expired, remove from cache
      this.cache.delete(url);
      this.removeFromAccessOrder(url);
      return null;
    }
    
    // Valid hit - update access order for LRU
    this.updateAccessOrder(url);
    
    return entry.content;
  }

  /**
   * Store content in cache
   */
  set(url: string, content: FetchedContent, queryContext?: string): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }
    
    // Determine TTL based on domain
    const ttl = this.getTtlForUrl(url);
    
    const entry: CacheEntry = {
      url,
      content,
      timestamp: Date.now(),
      ttl,
      query_context: queryContext || '',
    };
    
    this.cache.set(url, entry);
    this.updateAccessOrder(url);
  }

  /**
   * Check if URL is cached and valid
   */
  has(url: string): boolean {
    return this.get(url) !== null;
  }

  /**
   * Remove specific URL from cache
   */
  delete(url: string): boolean {
    const existed = this.cache.delete(url);
    if (existed) {
      this.removeFromAccessOrder(url);
    }
    return existed;
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    totalHits: number;
    totalMisses: number;
  } {
    // Simple stats - in production would track hits/misses
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: 0, // Would need to track
      totalHits: 0,
      totalMisses: 0,
    };
  }

  /**
   * Get TTL for a specific URL
   */
  private getTtlForUrl(url: string): number {
    try {
      const domain = new URL(url).hostname.toLowerCase();
      
      // Check for domain-specific TTL
      for (const [pattern, ttl] of this.domainTtls.entries()) {
        if (domain.includes(pattern.toLowerCase())) {
          return ttl;
        }
      }
      
      // Check for content type specific TTL
      const contentType = this.inferContentType(domain);
      switch (contentType) {
        case 'news': return 60 * 60 * 1000; // 1 hour
        case 'social': return 30 * 60 * 1000; // 30 minutes
        case 'reference': return 24 * 60 * 60 * 1000; // 24 hours
        case 'ecommerce': return 6 * 60 * 60 * 1000; // 6 hours
        default: return this.defaultTtlMs;
      }
    } catch {
      return this.defaultTtlMs;
    }
  }

  /**
   * Infer content type from domain
   */
  private inferContentType(domain: string): string {
    if (domain.includes('news') || domain.includes('bbc') || domain.includes('cnn')) {
      return 'news';
    }
    if (domain.includes('reddit') || domain.includes('twitter') || domain.includes('facebook')) {
      return 'social';
    }
    if (domain.includes('wikipedia') || domain.includes('docs') || domain.includes('edu')) {
      return 'reference';
    }
    if (domain.includes('amazon') || domain.includes('shop') || domain.includes('store')) {
      return 'ecommerce';
    }
    return 'general';
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;
    
    // Remove oldest accessed item
    const oldestUrl = this.accessOrder[0];
    this.cache.delete(oldestUrl);
    this.accessOrder.shift();
  }

  /**
   * Update access order for LRU tracking
   */
  private updateAccessOrder(url: string): void {
    // Remove if exists
    this.removeFromAccessOrder(url);
    // Add to end (most recent)
    this.accessOrder.push(url);
  }

  /**
   * Remove URL from access order tracking
   */
  private removeFromAccessOrder(url: string): void {
    const index = this.accessOrder.indexOf(url);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Get all cached URLs (for debugging)
   */
  getCachedUrls(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get expired entries for cleanup
   */
  getExpiredEntries(): string[] {
    const now = Date.now();
    const expired: string[] = [];
    
    for (const [url, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        expired.push(url);
      }
    }
    
    return expired;
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): number {
    const expired = this.getExpiredEntries();
    
    for (const url of expired) {
      this.cache.delete(url);
      this.removeFromAccessOrder(url);
    }
    
    return expired.length;
  }
}

export default ContentCache;
