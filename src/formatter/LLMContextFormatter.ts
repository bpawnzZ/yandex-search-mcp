import type { 
  EnhancedSearchResult, 
  FormattedContext, 
  KeyFinding, 
  ConflictInfo,
  SourceReference 
} from '../types/enhanced.js';

export class LLMContextFormatter {
  /**
   * Format search results into structured context for LLM
   */
  formatForLLM(
    results: EnhancedSearchResult[], 
    query: string,
    tokenLimit: number = 8000
  ): FormattedContext {
    // Filter to successful extractions
    const successfulResults = results.filter(
      r => r.fetched_content?.metadata.status === 'success'
    );
    
    // Generate summary
    const summary = this.generateSummary(successfulResults, query);
    
    // Extract key findings
    const keyFindings = this.extractKeyFindings(successfulResults, query);
    
    // Synthesize knowledge
    const synthesizedKnowledge = this.synthesizeKnowledge(successfulResults, query);
    
    // Check for conflicts
    const conflictingInfo = this.identifyConflicts(successfulResults);
    
    // Create source references
    const sourceReferences = this.createSourceReferences(successfulResults);
    
    return {
      summary,
      key_findings: keyFindings,
      synthesized_knowledge: synthesizedKnowledge,
      conflicting_info: conflictingInfo.length > 0 ? conflictingInfo : undefined,
      source_references: sourceReferences,
    };
  }

  /**
   * Generate a concise summary
   */
  private generateSummary(
    results: EnhancedSearchResult[], 
    query: string
  ): string {
    const totalSources = results.length;
    const totalWordCount = results.reduce(
      (sum, r) => sum + (r.fetched_content?.metadata.word_count || 0), 
      0
    );
    
    const contentTypes = this.getContentTypeBreakdown(results);
    
    let summary = `Based on ${totalSources} sources `;
    summary += `(${totalWordCount.toLocaleString()} words analyzed), `;
    summary += `here is what we found about "${query}":\n\n`;
    
    // Add content type breakdown
    if (Object.keys(contentTypes).length > 0) {
      summary += 'Content types analyzed: ';
      summary += Object.entries(contentTypes)
        .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
        .join(', ');
      summary += '.\n\n';
    }
    
    // Add top-level insight
    const topResult = results[0];
    if (topResult?.fetched_content?.summary) {
      summary += `Key insight from primary source (${topResult.displayUrl || topResult.url}): `;
      summary += topResult.fetched_content.summary.substring(0, 300) + '...';
    }
    
    return summary;
  }

  /**
   * Extract key findings from all sources
   */
  private extractKeyFindings(
    results: EnhancedSearchResult[], 
    query: string
  ): KeyFinding[] {
    const findings: KeyFinding[] = [];
    
    for (const result of results) {
      if (!result.fetched_content) continue;
      
      const content = result.fetched_content.full_text;
      const keyPoints = result.fetched_content.key_points || [];
      
      // Add each key point as a finding
      for (const point of keyPoints.slice(0, 3)) {
        findings.push({
          source: result.displayUrl || result.url,
          finding: point,
          confidence: this.assessConfidence(point, content, query),
        });
      }
    }
    
    // Sort by confidence and limit
    findings.sort((a, b) => {
      const confidenceOrder = { high: 3, medium: 2, low: 1 };
      return confidenceOrder[b.confidence] - confidenceOrder[a.confidence];
    });
    
    return findings.slice(0, 10);
  }

  /**
   * Synthesize knowledge across sources
   */
  private synthesizeKnowledge(
    results: EnhancedSearchResult[], 
    query: string
  ): string {
    const themes = this.identifyThemes(results);
    
    let synthesis = `Synthesis of findings regarding "${query}":\n\n`;
    
    // Identify consensus areas
    const consensus = this.findConsensus(results);
    if (consensus.length > 0) {
      synthesis += '**Areas of consensus:**\n';
      for (const item of consensus.slice(0, 3)) {
        synthesis += `• ${item}\n`;
      }
      synthesis += '\n';
    }
    
    // Identify different perspectives
    const perspectives = this.identifyPerspectives(results);
    if (perspectives.length > 0) {
      synthesis += '**Different perspectives:**\n';
      for (const perspective of perspectives.slice(0, 3)) {
        synthesis += `• ${perspective}\n`;
      }
      synthesis += '\n';
    }
    
    // Add coverage summary
    synthesis += `**Source coverage:** Information gathered from ${results.length} sources `;
    synthesis += `including ${themes.join(', ')}. `;
    synthesis += 'Each finding includes source attribution for verification.';
    
    return synthesis;
  }

  /**
   * Identify conflicting information
   */
  private identifyConflicts(results: EnhancedSearchResult[]): ConflictInfo[] {
    const conflicts: ConflictInfo[] = [];
    
    // Simple conflict detection based on negation patterns
    const negationPatterns = [
      /is not|are not|does not|do not|cannot|will not/i,
      /false|incorrect|wrong|myth/i,
    ];
    
    for (const result of results) {
      if (!result.fetched_content) continue;
      
      const text = result.fetched_content.full_text;
      
      for (const pattern of negationPatterns) {
        const matches = text.match(pattern);
        if (matches) {
          // Look for surrounding context
          const index = text.search(pattern);
          const context = text.substring(Math.max(0, index - 100), index + 100);
          
          // Check if this contradicts other sources
          for (const other of results) {
            if (other === result || !other.fetched_content) continue;
            
            const otherText = other.fetched_content.full_text;
            
            // If one source negates what another affirms
            if (this.areContradictory(context, otherText)) {
              conflicts.push({
                topic: this.extractTopic(context),
                sources: [
                  result.displayUrl || result.url,
                  other.displayUrl || other.url,
                ],
                discrepancy: `One source claims "${context.substring(0, 100)}..." while another presents different information.`,
              });
            }
          }
        }
      }
    }
    
    // Remove duplicates
    return conflicts.filter((c, i, a) => 
      a.findIndex(t => t.topic === c.topic) === i
    ).slice(0, 5);
  }

  /**
   * Create formatted source references
   */
  private createSourceReferences(results: EnhancedSearchResult[]): SourceReference[] {
    return results.map(result => ({
      url: result.url,
      title: result.title,
      key_points: result.fetched_content?.key_points?.slice(0, 3) || [],
      relevance_note: result.relevance_score 
        ? `Relevance score: ${result.relevance_score.toFixed(1)}/100`
        : 'Source from search results',
    }));
  }

  /**
   * Assess confidence level of a finding
   */
  private assessConfidence(
    finding: string, 
    fullContent: string, 
    query: string
  ): 'high' | 'medium' | 'low' {
    let score = 0;
    
    // Query relevance
    const queryWords = query.toLowerCase().split(/\s+/);
    const findingLower = finding.toLowerCase();
    for (const word of queryWords) {
      if (findingLower.includes(word)) score += 1;
    }
    
    // Specificity indicators
    if (finding.match(/\d+/)) score += 1; // Contains numbers
    if (finding.match(/\b(study|research|found|discovered|according to)\b/i)) score += 1;
    
    // Certainty language
    if (finding.match(/\b(proven|demonstrated|confirmed|established)\b/i)) score += 1;
    if (finding.match(/\b(maybe|might|possibly|could be)\b/i)) score -= 1;
    
    if (score >= 4) return 'high';
    if (score >= 2) return 'medium';
    return 'low';
  }

  /**
   * Get breakdown of content types
   */
  private getContentTypeBreakdown(
    results: EnhancedSearchResult[]
  ): Record<string, number> {
    const breakdown: Record<string, number> = {};
    
    for (const result of results) {
      const type = result.fetched_content?.metadata.content_type || 'unknown';
      breakdown[type] = (breakdown[type] || 0) + 1;
    }
    
    return breakdown;
  }

  /**
   * Identify themes across sources
   */
  private identifyThemes(results: EnhancedSearchResult[]): string[] {
    const themes = new Set<string>();
    
    for (const result of results) {
      const type = result.fetched_content?.metadata.content_type;
      if (type && type !== 'other') {
        themes.add(type + 's');
      }
    }
    
    return Array.from(themes);
  }

  /**
   * Find consensus areas across sources
   */
  private findConsensus(results: EnhancedSearchResult[]): string[] {
    // Simplified: return common key points
    const allPoints: string[] = [];
    
    for (const result of results) {
      if (result.fetched_content?.key_points) {
        allPoints.push(...result.fetched_content.key_points);
      }
    }
    
    // Find points that appear in multiple sources (simplified)
    return allPoints.slice(0, 3);
  }

  /**
   * Identify different perspectives
   */
  private identifyPerspectives(results: EnhancedSearchResult[]): string[] {
    const perspectives: string[] = [];
    
    for (const result of results) {
      const domain = result.displayUrl || result.url;
      const type = result.fetched_content?.metadata.content_type;
      
      if (type === 'forum' || type === 'blog') {
        perspectives.push(`Community discussion from ${domain}`);
      } else if (type === 'article') {
        perspectives.push(`Editorial perspective from ${domain}`);
      } else if (type === 'documentation') {
        perspectives.push(`Technical documentation from ${domain}`);
      }
    }
    
    return perspectives;
  }

  /**
   * Check if two texts are contradictory
   */
  private areContradictory(text1: string, text2: string): boolean {
    // Simplified: check for negation in one and affirmation in other
    const negationWords = ['not', 'false', 'incorrect', 'myth', 'doesn\'t', 'isn\'t'];
    
    const hasNegation1 = negationWords.some(w => text1.toLowerCase().includes(w));
    const hasNegation2 = negationWords.some(w => text2.toLowerCase().includes(w));
    
    return hasNegation1 !== hasNegation2;
  }

  /**
   * Extract topic from context
   */
  private extractTopic(context: string): string {
    // Simple extraction: first noun phrase
    const words = context.split(/\s+/).slice(0, 5);
    return words.join(' ').replace(/[^\w\s]/g, '').trim();
  }
}

export default LLMContextFormatter;
