/**
 * Clipboard utilities for rich formatted copy, selection capture, and markdown export.
 * Preserves all Markdown effects (bold, italics, code blocks, lists, headings)
 * and strictly preserves line breaks and empty lines across all target applications
 * (Google Docs, Microsoft Word, Notion, Slack, Apple Notes, Gmail, VS Code, Notepad).
 */

import { Message } from '../types';

/**
 * Escapes characters for HTML output.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Converts a DOM node into clean plain text while strictly preserving:
 * - Empty lines between paragraphs (\n\n)
 * - Explicit line breaks (\n for <br>)
 * - Headers, lists, and blockquotes with proper spacing
 * - Monospace code blocks with exact internal indentation and line breaks
 * - Omits decorative UI elements (copy buttons, tags, pulsars, select-none)
 * - NEVER destroys or collapses empty lines (empty lines are text)
 */
export function convertDomToPlainText(node: Node): string {
  let text = '';

  function walk(current: Node) {
    if (current.nodeType === Node.TEXT_NODE) {
      let rawContent = current.textContent || '';
      
      // If adjacent to <br> or block element, trim JSX formatting line breaks & indents
      const prevSiblingName = current.previousSibling?.nodeName.toLowerCase();
      const nextSiblingName = current.nextSibling?.nodeName.toLowerCase();

      if (prevSiblingName === 'br') {
        rawContent = rawContent.replace(/^[\r\n\s]+/, '');
      }
      if (nextSiblingName === 'br') {
        rawContent = rawContent.replace(/[\r\n\s]+$/, '');
      }

      text += rawContent;
      return;
    }

    if (current.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const el = current as HTMLElement;

    // Skip elements with select-none, buttons, or hidden helpers
    if (
      el.classList?.contains('select-none') ||
      el.tagName.toLowerCase() === 'button' ||
      el.getAttribute('aria-hidden') === 'true' ||
      el.style.display === 'none' ||
      el.style.visibility === 'hidden'
    ) {
      return;
    }

    const tagName = el.tagName.toLowerCase();

    // Code blocks: extract verbatim code preserving internal newlines
    if (tagName === 'pre') {
      if (text && !text.endsWith('\n')) {
        text += '\n';
      }
      const codeEl = el.querySelector('code') || el;
      const codeContent = codeEl.textContent || '';
      text += codeContent.replace(/\r\n/g, '\n');
      if (!text.endsWith('\n')) {
        text += '\n';
      }
      return;
    }

    if (tagName === 'br') {
      if (!text.endsWith('\n')) {
        text += '\n';
      }
      return;
    }

    const isBlock = [
      'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'blockquote', 'tr', 'table', 'hr'
    ].includes(tagName);

    if (isBlock) {
      if (tagName === 'li') {
        if (text && !text.endsWith('\n')) {
          text += '\n';
        }
        text += '• ';
      } else if (tagName.startsWith('h') && tagName.length === 2) {
        if (text && !text.endsWith('\n')) {
          text += '\n';
        }
      } else if (tagName === 'p' || tagName === 'blockquote') {
        if (text && !text.endsWith('\n\n')) {
          text += text.endsWith('\n') ? '\n' : '\n\n';
        }
      } else if (tagName === 'tr') {
        if (text && !text.endsWith('\n')) {
          text += '\n';
        }
      }
    }

    for (let i = 0; i < el.childNodes.length; i++) {
      walk(el.childNodes[i]);
    }

    if (isBlock) {
      if (tagName === 'li') {
        if (!text.endsWith('\n')) {
          text += '\n';
        }
      } else if (tagName === 'p' || tagName.startsWith('h') || tagName === 'blockquote') {
        if (!text.endsWith('\n\n')) {
          text += text.endsWith('\n') ? '\n' : '\n\n';
        }
      }
    }
  }

  walk(node);

  return text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
}

/**
 * Transforms a DOM node into standard rich HTML with inline CSS styling.
 * This ensures that when pasted into Google Docs, Word, Gmail, Slack, Notion, etc.,
 * all Markdown effects (bold, italics, code, headings, lists, quotes, tables)
 * are rendered visually rather than being lost or stripped.
 */
export function convertDomToRichHtml(node: Node): string {
  const clone = node.cloneNode(true) as HTMLElement;

  // Clean up DOM whitespace around <br> tags so Chrome clipboard parser doesn't double newlines
  let htmlContent = clone.innerHTML;
  htmlContent = htmlContent.replace(/[\r\n\s]*<br\s*\/?>[\r\n\s]*/gi, '<br>');
  clone.innerHTML = htmlContent;

  // 1. Remove select-none, buttons, inputs, audio players, and transient UI helpers
  const toRemove = clone.querySelectorAll(
    '.select-none, button, [aria-hidden="true"], input, textarea, .animate-pulse, audio'
  );
  toRemove.forEach(el => el.remove());

  // 2. Inline styles for bold and strong elements
  const strongs = clone.querySelectorAll('strong, b');
  strongs.forEach(el => {
    const htmlEl = el as HTMLElement;
    htmlEl.style.fontWeight = '700';
  });

  // 3. Inline styles for italics
  const ems = clone.querySelectorAll('em, i');
  ems.forEach(el => {
    const htmlEl = el as HTMLElement;
    htmlEl.style.fontStyle = 'italic';
  });

  // 4. Inline styles for headings
  const headings = clone.querySelectorAll('h1, h2, h3, h4, h5, h6');
  headings.forEach(h => {
    const htmlEl = h as HTMLElement;
    htmlEl.style.fontWeight = '700';
    htmlEl.style.lineHeight = '1.3';
    htmlEl.style.margin = '0.85em 0 0.4em 0';
    if (htmlEl.tagName === 'H1') htmlEl.style.fontSize = '1.6em';
    else if (htmlEl.tagName === 'H2') htmlEl.style.fontSize = '1.4em';
    else if (htmlEl.tagName === 'H3') htmlEl.style.fontSize = '1.2em';
    else htmlEl.style.fontSize = '1.1em';
  });

  // 5. Inline styles for paragraphs
  const paragraphs = clone.querySelectorAll('p');
  paragraphs.forEach(p => {
    const htmlEl = p as HTMLElement;
    htmlEl.style.margin = '0 0 0.85em 0';
    htmlEl.style.padding = '0';
    htmlEl.style.lineHeight = '1.6';
  });

  // 6. Inline styles for code elements
  const inlineCodes = clone.querySelectorAll('code');
  inlineCodes.forEach(c => {
    const htmlEl = c as HTMLElement;
    if (htmlEl.parentElement?.tagName.toLowerCase() !== 'pre') {
      htmlEl.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
      htmlEl.style.backgroundColor = 'rgba(128, 128, 128, 0.15)';
      htmlEl.style.padding = '2px 5px';
      htmlEl.style.borderRadius = '3px';
      htmlEl.style.fontSize = '0.9em';
      htmlEl.style.color = '#c2410c';
    }
  });

  const pres = clone.querySelectorAll('pre');
  pres.forEach(p => {
    const htmlEl = p as HTMLElement;
    htmlEl.style.backgroundColor = '#f4f4f5';
    htmlEl.style.color = '#18181b';
    htmlEl.style.border = '1px solid #e4e4e7';
    htmlEl.style.padding = '12px 14px';
    htmlEl.style.borderRadius = '6px';
    htmlEl.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    htmlEl.style.fontSize = '12.5px';
    htmlEl.style.lineHeight = '1.5';
    htmlEl.style.margin = '0.85em 0';
  });

  // 7. Inline styles for lists
  const lists = clone.querySelectorAll('ul, ol');
  lists.forEach(l => {
    const htmlEl = l as HTMLElement;
    htmlEl.style.margin = '0.5em 0 0.85em 1.5em';
    htmlEl.style.padding = '0';
  });

  const listItems = clone.querySelectorAll('li');
  listItems.forEach(li => {
    const htmlEl = li as HTMLElement;
    htmlEl.style.marginBottom = '0.25em';
    htmlEl.style.lineHeight = '1.6';
  });

  // 8. Blockquotes
  const blockquotes = clone.querySelectorAll('blockquote');
  blockquotes.forEach(b => {
    const htmlEl = b as HTMLElement;
    htmlEl.style.borderLeft = '3px solid #c2a472';
    htmlEl.style.paddingLeft = '12px';
    htmlEl.style.margin = '0.85em 0';
    htmlEl.style.fontStyle = 'italic';
    htmlEl.style.color = '#4b5563';
  });

  // 9. Tables
  const tables = clone.querySelectorAll('table');
  tables.forEach(t => {
    const htmlEl = t as HTMLElement;
    htmlEl.style.borderCollapse = 'collapse';
    htmlEl.style.margin = '1em 0';
    htmlEl.style.width = '100%';
  });

  const cells = clone.querySelectorAll('th, td');
  cells.forEach(cell => {
    const htmlEl = cell as HTMLElement;
    htmlEl.style.border = '1px solid #d1d5db';
    htmlEl.style.padding = '6px 10px';
  });

  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: inherit;">${clone.innerHTML}</div>`;
}

/**
 * Writes both rich HTML and plain text to the clipboard.
 * Uses modern ClipboardItem API first, with full fallback to document.execCommand('copy').
 */
export async function copyToClipboard(richHtml: string, plainText: string): Promise<boolean> {
  // Method 1: Modern Clipboard API with ClipboardItem
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof ClipboardItem !== 'undefined') {
    try {
      const htmlBlob = new Blob([richHtml], { type: 'text/html' });
      const textBlob = new Blob([plainText], { type: 'text/plain' });
      const item = new ClipboardItem({
        'text/html': htmlBlob,
        'text/plain': textBlob,
      });
      await navigator.clipboard.write([item]);
      return true;
    } catch (err) {
      console.warn('navigator.clipboard.write with ClipboardItem failed, falling back:', err);
    }
  }

  // Method 2: Capture copy event with document.execCommand('copy')
  try {
    const copyListener = (e: ClipboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.clipboardData) {
        e.clipboardData.setData('text/html', richHtml);
        e.clipboardData.setData('text/plain', plainText);
      }
    };

    document.addEventListener('copy', copyListener, { capture: true, once: true });
    const success = document.execCommand('copy');
    if (success) return true;
  } catch (err) {
    console.warn('execCommand fallback failed:', err);
  }

  // Method 3: Simple writeText (plain text only)
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(plainText);
      return true;
    }
  } catch (err) {
    console.error('All clipboard methods failed:', err);
  }

  return false;
}

/**
 * Extracts selection from chat container with rich formatting and exact line breaks.
 * - If inside a single bubble: copies without speaker prefix.
 * - If across multiple bubbles: prefixes speaker names.
 * - Strictly includes both text/html and text/plain.
 */
export function extractChatSelection(
  selection: Selection,
  container: HTMLElement
): { html: string; text: string } | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);

  // Check if selection is inside an actual preformatted code element (<pre> or <code>)
  const ancestor = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? (range.commonAncestorContainer as HTMLElement)
    : range.commonAncestorContainer.parentElement;

  const isPreformattedCode = Boolean(
    ancestor?.closest('pre') ||
    ancestor?.closest('code')
  );

  if (isPreformattedCode) {
    const rawText = selection.toString().replace(/\r\n/g, '\n');
    if (rawText) {
      const richHtml = `<div style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11px; line-height: 1.5; background: #18181b; color: #f4f4f5; padding: 8px; border-radius: 4px;">${escapeHtml(rawText).replace(/\n/g, '<br>')}</div>`;
      return { html: richHtml, text: rawText };
    }
  }

  const bubbleElements = Array.from(container.querySelectorAll('.message-bubble')) as HTMLElement[];

  // Find all message bubbles intersecting the selection
  const intersectingBubbles = bubbleElements.filter(bubble => range.intersectsNode(bubble));

  if (intersectingBubbles.length === 0) {
    const rawText = selection.toString().replace(/\r\n/g, '\n');
    if (!rawText) return null;
    const cloned = range.cloneContents();
    const tempDiv = document.createElement('div');
    tempDiv.appendChild(cloned);
    const convertedText = convertDomToPlainText(tempDiv).trim();
    const text = convertedText || rawText;
    const html = `<div style="font-family: inherit; line-height: 1.6;">${escapeHtml(text).replace(/\n/g, '<br>')}</div>`;
    return { html, text };
  }

  // Intersecting one or more message bubbles
  const htmlParts: string[] = [];
  const textParts: string[] = [];

  intersectingBubbles.forEach(bubble => {
    const tempRange = document.createRange();
    tempRange.selectNodeContents(bubble);

    if (range.compareBoundaryPoints(Range.START_TO_START, tempRange) > 0) {
      tempRange.setStart(range.startContainer, range.startOffset);
    }
    if (range.compareBoundaryPoints(Range.END_TO_END, tempRange) < 0) {
      tempRange.setEnd(range.endContainer, range.endOffset);
    }

    const fragment = tempRange.cloneContents();
    const tempDiv = document.createElement('div');
    tempDiv.appendChild(fragment);

    const partText = convertDomToPlainText(tempDiv).trim();
    if (!partText) return;

    const partHtml = convertDomToRichHtml(tempDiv);

    const isUser = bubble.getAttribute('data-is-user') === 'true';
    const isThought = bubble.getAttribute('data-is-thought') === 'true';
    const modelId = bubble.getAttribute('data-model-id') || 'Assistant';
    const label = isThought ? `[${modelId}] (Thinking Process)` : (isUser ? 'Pilot' : `[${modelId}]`);

    textParts.push(`${label}:\n${partText}`);
    htmlParts.push(`<div><strong style="color: #c2a472;">${escapeHtml(label)}:</strong><div style="margin-top:4px;">${partHtml}</div></div>`);
  });

  if (textParts.length === 0) return null;

  return {
    text: textParts.join('\n\n'),
    html: htmlParts.join('<br><br>'),
  };
}

/**
 * Extracts clean raw Markdown string from a message object,
 * stripping internal thinking tags and normalizing line endings.
 */
export function getCleanMarkdownContent(msg: Message): string {
  let content = '';
  if (typeof msg.content === 'string') {
    content = msg.content;
  } else if (Array.isArray(msg.content)) {
    content = (msg.content as any[])
      .map(part => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && part.text) return part.text;
        return '';
      })
      .filter(Boolean)
      .join('\n\n');
  } else if (msg.content) {
    content = String(msg.content);
  }

  // For assistant messages (unless specifically a thinking log), strip out thinking tags
  if (msg.role === 'assistant' && !msg.isThought) {
    content = content.replace(/<(thought|thinking)>[\s\S]*?<\/\1>/gi, '');
    content = content.replace(/<(thought|thinking)>[\s\S]*/gi, '');
  }

  // Clean bio directives or internal thread commands
  content = content
    .replace(/\/memory_create\(\{[\s\S]*?\}\)/g, '')
    .replace(/\/memory_delete\(\{[\s\S]*?\}\)/g, '')
    .replace(/\/thread_title\(\{[\s\S]*?\}\)/g, '');

  content = content.replace(/\r\n/g, '\n').trim();

  // Attach images as markdown image syntax if not already present
  if (msg.images && msg.images.length > 0) {
    const imagesToAdd = msg.images.filter(img => !content.includes(img));
    if (imagesToAdd.length > 0) {
      const markdownImages = imagesToAdd.map((img, idx) => `![Image ${idx + 1}](${img})`).join('\n\n');
      content = content ? `${content}\n\n${markdownImages}` : markdownImages;
    }
  }

  return content;
}
