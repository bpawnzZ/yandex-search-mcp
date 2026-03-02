// Enhanced result with content extraction
export interface EnhancedSearchResult {
  position: number;
  title: string;
  url: string;
  snippet: string;
  displayUrl?: string;
  fetched_content?: FetchedContent;
  relevance_score?: number;
}

export interface FetchedContent {
  full_text: string;
  truncated_text?: string;
  summary?: string;
  key_points?: string[];
  metadata: ContentMetadata;
  extracted_links?: string[];
  images?: ImageData[];
}

export interface ContentMetadata {
  word_count: number;
  estimated_tokens: number;
  fetch_time_ms: number;
  content_type: 'article' | 'product' | 'forum' | 'blog' | 'documentation' | 'other';
  status: 'success' | 'failed' | 'truncated';
  error?: string;
}

export interface ImageData {
  src: string;
  alt: string;
  context?: string;
}

export interface ExtractionConfig {
  maxTokens: number;
  extractImages: boolean;
  extractLinks: boolean;
  prioritizeMainContent: boolean;
  removeBoilerplate: boolean;
}

export interface CacheEntry {
  url: string;
  content: FetchedContent;
  timestamp: number;
  ttl: number;
  query_context: string;
}

export interface FormattedContext {
  summary: string;
  key_findings: KeyFinding[];
  synthesized_knowledge: string;
  conflicting_info?: ConflictInfo[];
  source_references: SourceReference[];
}

export interface KeyFinding {
  source: string;
  finding: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ConflictInfo {
  topic: string;
  sources: string[];
  discrepancy: string;
}

export interface SourceReference {
  url: string;
  title: string;
  key_points: string[];
  relevance_note: string;
}

// Input schema extension
export interface YandexSearchEnhancedInput {
  query: string;
  numResults?: number;
  region?: string;
  language?: string;
  safeSearch?: boolean;
  fetch_content?: boolean;
  max_pages?: number;
  max_tokens_per_page?: number;
  summarize?: boolean;
  extract_key_points?: boolean;
  analysis_level?: 'basic' | 'detailed' | 'comprehensive';
  context_format?: 'raw' | 'summarized' | 'synthesized' | 'qa_ready';
}
