/**
 * services/context-extractor.js
 * ─────────────────────────────
 * Responsibility: Extract optimized, high-signal context from webpage text using:
 *  1. Metadata matching (page title and URL slug tokenization)
 *  2. First-paragraph anchor extraction (preserves topic grounding and coreference resolution)
 *  3. Keyword frequency and coverage scoring (TF + coverage + metadata boost)
 *  4. Evaluative selection (routes targeted queries to anchor+target, or broad queries to sequential context)
 */

// Common English connectors/stop-words to exclude from scoring
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any',
  'are', 'aren\'t', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
  'between', 'both', 'but', 'by', 'can', 'cannot', 'could', 'did', 'do', 'does',
  'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has',
  'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his',
  'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me', 'more',
  'most', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only',
  'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same',
  'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs',
  'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through',
  'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when',
  'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would', 'you', 'your'
]);

/**
 * Tokenize a string into clean, lowercase alphanumeric terms, stripping stop words.
 */
export function extractTokens(text) {
  if (!text || typeof text !== 'string') return [];
  return (text.toLowerCase().match(/\b[a-z0-9]{2,}\b/g) || [])
    .filter((term) => !STOP_WORDS.has(term));
}

/**
 * Extract tokens from page metadata (Page Title & URL path/slug).
 */
export function extractMetadataTokens(pageTitle, pageUrl) {
  const tokens = [];

  if (pageTitle && typeof pageTitle === 'string') {
    tokens.push(...extractTokens(pageTitle));
  }

  if (pageUrl && typeof pageUrl === 'string') {
    try {
      const url = new URL(pageUrl);
      // Split path segments by slashes, dashes, and underscores
      const pathTerms = url.pathname
        .replace(/[/_\-.]+/g, ' ')
        .split(/\s+/);
      tokens.push(...extractTokens(pathTerms.join(' ')));
    } catch {
      // Invalid URL format - ignore
    }
  }

  return new Set(tokens);
}

/**
 * Check if the user query is asking for a broad overview/summary.
 */
export function isBroadOverviewQuery(query) {
  if (!query) return true;
  return /\b(summar(y|ize)|overview|tl;?dr|what is this (page|article|site)|brief|main idea|takeaways?)\b/i.test(query);
}

/**
 * Evaluates candidate paragraphs based on:
 * - Keyword frequency (TF)
 * - Keyword coverage (unique query tokens matched)
 * - Metadata alignment bonus (matching title/URL topics)
 * - Length normalization
 */
export function scoreParagraph(paragraph, queryTokenSet, metadataTokenSet) {
  const words = paragraph.toLowerCase().match(/\b[a-z0-9]{2,}\b/g) || [];
  if (words.length === 0) return { score: 0, matchedTokens: new Set() };

  let termFrequency = 0;
  const matchedTokens = new Set();
  let metadataHits = 0;

  for (const word of words) {
    if (queryTokenSet.has(word)) {
      termFrequency++;
      matchedTokens.add(word);
    }
    if (metadataTokenSet.has(word)) {
      metadataHits++;
    }
  }

  // Coverage gives higher weight to paragraphs hitting MULTIPLE distinct query keywords
  const coverage = matchedTokens.size;
  if (coverage === 0) return { score: 0, matchedTokens };

  // Calculate score with slight length normalization (log2 of word count)
  // This prevents huge paragraphs from winning purely on raw length.
  const lengthNormalizer = Math.log2(words.length + 4);
  const rawScore = (coverage * 3.0) + (termFrequency * 1.0) + (metadataHits * 0.5);
  const normalizedScore = Number((rawScore / lengthNormalizer).toFixed(3));

  return {
    score: normalizedScore,
    matchedTokens,
  };
}

/**
 * Main context extraction pipeline:
 *  1. Segregates first paragraph as Lead Anchor.
 *  2. Evaluates query intent (broad vs targeted).
 *  3. Scores paragraphs with metadata and keyword matching.
 *  4. Evaluates and selects the highest-scoring context within budget.
 */
export function extractTargetedContext({
  pageContext,
  question,
  pageTitle = '',
  pageUrl = '',
  maxChars = 10000,
}) {
  if (!pageContext || typeof pageContext !== 'string') return '';

  const trimmedContext = pageContext.trim();

  // Segment into paragraphs separated by 2 or more line breaks
  const rawParagraphs = trimmedContext
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 40);

  // If the page is tiny (<= 2 paragraphs) or lacks paragraph structure, return as-is up to budget
  if (rawParagraphs.length <= 2) {
    return trimmedContext.slice(0, maxChars);
  }

  // 1. FIRST PARAGRAPH STRATEGY (The Anchor)
  // Paragraph 1 contains core entities, definitions, and topic grounding.
  const anchorPara = rawParagraphs[0];

  // 2. QUERY & METADATA ANALYSIS
  const queryTokens = extractTokens(question);
  const queryTokenSet = new Set(queryTokens);
  const metadataTokenSet = extractMetadataTokens(pageTitle, pageUrl);

  // If query is broad ("summarize") or has no keywords, evaluate to sequential coverage
  if (isBroadOverviewQuery(question) || queryTokenSet.size === 0) {
    let combined = anchorPara;
    for (let i = 1; i < rawParagraphs.length; i++) {
      const candidate = `${combined}\n\n${rawParagraphs[i]}`;
      if (candidate.length > maxChars) break;
      combined = candidate;
    }
    return combined;
  }

  // 3. CANDIDATE SCORING (Paragraph 2 onward)
  const candidateScores = [];

  for (let i = 1; i < rawParagraphs.length; i++) {
    const para = rawParagraphs[i];
    const { score, matchedTokens } = scoreParagraph(para, queryTokenSet, metadataTokenSet);

    if (score > 0) {
      candidateScores.push({
        index: i,
        text: para,
        score,
        matchedCount: matchedTokens.size,
      });
    }
  }

  // Sort candidates by score descending
  candidateScores.sort((a, b) => b.score - a.score);

  // 4. EVALUATION & SELECTION
  // Minimum score threshold to consider a paragraph genuinely relevant
  const RELEVANCE_THRESHOLD = 1.0;
  const bestCandidate = candidateScores[0];

  if (bestCandidate && bestCandidate.score >= RELEVANCE_THRESHOLD) {
    // Select top 1 or 2 relevant paragraphs that fit in the budget alongside Para 1
    const selectedSections = [bestCandidate.text];
    let currentLength = anchorPara.length + bestCandidate.text.length + 100;

    // Check if second-best candidate is also strong and fits in budget
    const secondCandidate = candidateScores[1];
    if (
      secondCandidate &&
      secondCandidate.score >= RELEVANCE_THRESHOLD &&
      (currentLength + secondCandidate.text.length + 100) <= maxChars
    ) {
      // Order them by original document appearance
      if (secondCandidate.index < bestCandidate.index) {
        selectedSections.unshift(secondCandidate.text);
      } else {
        selectedSections.push(secondCandidate.text);
      }
    }

    return [
      `[Topic Overview]\n${anchorPara}`,
      `[Relevant Context]\n${selectedSections.join('\n\n')}`,
    ].join('\n\n');
  }

  // Fallback: If no paragraph exceeded relevance threshold, return top sequential paragraphs
  let fallbackCombined = anchorPara;
  for (let i = 1; i < Math.min(rawParagraphs.length, 3); i++) {
    const next = `${fallbackCombined}\n\n${rawParagraphs[i]}`;
    if (next.length <= maxChars) {
      fallbackCombined = next;
    }
  }
  return fallbackCombined;
}
