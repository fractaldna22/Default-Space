/**
 * Utility functions for token estimation and conversation chunking.
 */

/**
 * Estimates the token count of a given text string.
 * Standard rule of thumb for English text with LLM tokenizers (BPE/WordPiece):
 * ~3.8 characters per token.
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.8);
}

/**
 * Formats a token count into a readable string with estimated character count.
 */
export function formatTokenEstimate(tokenCount: number): string {
  if (tokenCount <= 0) return '0 tokens (0 chars)';
  const chars = Math.round(tokenCount * 3.8);
  if (tokenCount >= 1000000) {
    return `${(tokenCount / 1000000).toFixed(2)}M tokens (~${(chars / 1000000).toFixed(2)}M chars)`;
  }
  if (tokenCount >= 1000) {
    return `${(tokenCount / 1000).toFixed(1)}k tokens (~${(chars / 1000).toFixed(1)}k chars)`;
  }
  return `${tokenCount} tokens (~${chars} chars)`;
}

/**
 * Chunks an array of messages into blocks of roughly maxTokensPerChunk (~60,000 tokens each).
 */
export function chunkMessagesForSummarization<T extends { content: string; role: string; timestamp?: string }>(
  messages: T[],
  maxTokensPerChunk: number = 60000
): T[][] {
  const chunks: T[][] = [];
  let currentChunk: T[] = [];
  let currentChunkTokens = 0;

  for (const msg of messages) {
    const msgTokens = estimateTokenCount(msg.content);
    if (currentChunk.length > 0 && currentChunkTokens + msgTokens > maxTokensPerChunk) {
      chunks.push(currentChunk);
      currentChunk = [msg];
      currentChunkTokens = msgTokens;
    } else {
      currentChunk.push(msg);
      currentChunkTokens += msgTokens;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}
