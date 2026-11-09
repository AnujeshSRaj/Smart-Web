import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractTokens,
  extractMetadataTokens,
  scoreParagraph,
  extractTargetedContext,
  isBroadOverviewQuery,
} from '../src/services/context-extractor.js';

describe('Context Extractor Service', () => {
  it('extracts tokens while stripping stop words', () => {
    const tokens = extractTokens('What is the capital of France in 1945?');
    assert.deepEqual(tokens, ['capital', 'france', '1945']);
  });

  it('extracts metadata tokens from page title and URL slug', () => {
    const metaTokens = extractMetadataTokens(
      'Treaty of Versailles - Wikipedia',
      'https://en.wikipedia.org/wiki/Treaty_of_Versailles'
    );
    assert.ok(metaTokens.has('treaty'));
    assert.ok(metaTokens.has('versailles'));
    assert.ok(metaTokens.has('wikipedia'));
    assert.ok(!metaTokens.has('of')); // stop word
  });

  it('detects broad overview queries vs specific queries', () => {
    assert.equal(isBroadOverviewQuery('Can you summarize this page for me?'), true);
    assert.equal(isBroadOverviewQuery('Give me a quick tl;dr'), true);
    assert.equal(isBroadOverviewQuery('What was the signing date in Article 231?'), false);
  });

  it('scores paragraphs higher when multiple distinct query terms match', () => {
    const querySet = new Set(['economic', 'reparations', 'germany']);
    const metaSet = new Set(['treaty', 'versailles']);

    const paraA = 'Germany paid reparations and faced severe economic challenges.';
    const paraB = 'Germany was a country in Europe. Germany had borders.';

    const scoreA = scoreParagraph(paraA, querySet, metaSet);
    const scoreB = scoreParagraph(paraB, querySet, metaSet);

    assert.ok(scoreA.score > scoreB.score, 'Paragraph matching 3 terms should outscore 1 term repeated');
  });

  it('evaluates and incorporates Paragraph 1 anchor plus matched target paragraph', () => {
    const samplePage = `
The Treaty of Versailles was the primary peace treaty produced by the Paris Peace Conference at the end of World War I. It was signed on 28 June 1919.

The League of Nations was founded as a result of the treaty to maintain world peace and arbitrate international disputes.

Article 231, often known as the War Guilt clause, forced Germany to accept complete responsibility for causing the war and pay severe economic reparations amounting to 132 billion gold marks.

The geographical boundaries of Europe changed dramatically as several new independent states emerged from former empires.
    `.trim();

    const result = extractTargetedContext({
      pageContext: samplePage,
      question: 'How much were the economic reparations Germany had to pay?',
      pageTitle: 'Treaty of Versailles - Wikipedia',
      pageUrl: 'https://en.wikipedia.org/wiki/Treaty_of_Versailles',
      maxChars: 5000,
    });

    // Check that Paragraph 1 (the Anchor) is preserved
    assert.ok(result.includes('[Topic Overview]'), 'Should contain Topic Overview header');
    assert.ok(result.includes('primary peace treaty produced by the Paris Peace Conference'), 'Should have Paragraph 1');

    // Check that the relevant section (Article 231 / reparations) was extracted
    assert.ok(result.includes('[Relevant Context]'), 'Should contain Relevant Context header');
    assert.ok(result.includes('132 billion gold marks'), 'Should select the reparations paragraph');

    // Check that irrelevant sections (League of Nations, boundaries) are not polluting context
    assert.ok(!result.includes('arbitrate international disputes'), 'Irrelevant section should be omitted');
  });

  it('falls back to sequential context for broad overview queries', () => {
    const samplePage = `
Artificial Intelligence began as a modern academic discipline in 1956 at Dartmouth College.

Machine learning became prominent in the 1990s as data availability increased.

Deep learning breakthroughs in the 2010s transformed computer vision and speech recognition.
    `.trim();

    const result = extractTargetedContext({
      pageContext: samplePage,
      question: 'Summarize the history of AI',
      pageTitle: 'AI History',
      maxChars: 5000,
    });

    // Should include the sequential flow without artificial section splitting
    assert.ok(result.includes('Dartmouth College'));
    assert.ok(result.includes('Machine learning became prominent'));
  });
});
