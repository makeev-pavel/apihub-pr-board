// GitHub comment Markdown: GFM with inline HTML, sanitized before it reaches the page. Browser only, because
// DOMPurify needs the DOM.

import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { stripHtmlComments } from './model/comments.ts';

// Rendering is cached per comment body; the board holds at most a few hundred comments.
const MAX_CACHED = 1000;
const htmlCache = new Map<string, string>();
const textCache = new Map<string, string>();
// Closing tags of blocks that need a space between them once the markup is gone.
const BLOCK_END = /<\/(p|h[1-6]|li|tr|td|th|pre|blockquote|summary|div)>|<br\s*\/?>/gi;

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

function cached(cache: Map<string, string>, key: string, compute: () => string): string {
  let value = cache.get(key);
  if (value === undefined) {
    if (cache.size >= MAX_CACHED) cache.clear();
    value = compute();
    cache.set(key, value);
  }
  return value;
}

// GitHub keeps single line breaks in comments, unlike in Markdown files.
export function renderMarkdown(body: string): string {
  return cached(htmlCache, body, () => {
    const html = marked.parse(stripHtmlComments(body), { gfm: true, breaks: true, async: false });
    // Page classes and ids are dropped too, so a comment cannot borrow the board's own styles or anchors.
    return DOMPurify.sanitize(html, { FORBID_TAGS: ['style', 'form'], FORBID_ATTR: ['style', 'class', 'id'] });
  });
}

// The comment as one line of plain text, for the preview in the table cell.
export function markdownText(body: string): string {
  return cached(textCache, body, () => {
    const doc = new DOMParser().parseFromString(renderMarkdown(body).replace(BLOCK_END, ' $&'), 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  });
}
