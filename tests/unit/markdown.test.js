// Tests for parseMarkdown() — core markdown parser
// parseMarkdown uses escapeHtml internally which requires DOM, so we use JSDOM

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
// We need to manually load the functions
function escapeHtml(str) {
  if (!str && str !== 0) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function parseMarkdown(text) {
  if (!text) return '';
  let html = escapeHtml(text);
  // Code blocks (```...```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Strikethrough
  html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  // Links (with XSS-safe URL filtering)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
    if (isSafeUrl(url)) {
      return '<a href="' + url + '" target="_blank" rel="noopener">' + label + '</a>';
    }
    return label;
  });
  // Unordered lists
  html = html.replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  // Headers
  html = html.replace(/^###\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^##\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^#\s+(.+)$/gm, '<h2>$1</h2>');
  // Blockquotes
  html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote>$1</blockquote>');
  // Line breaks
  html = html.replace(/\n/g, '<br>');
  // Clean up extra <br> around block elements
  html = html.replace(/<br><(h[2-4]|ul|ol|li|pre|blockquote)/g, '<$1');
  html = html.replace(/<\/(h[2-4]|ul|ol|li|pre|blockquote)><br>/g, '</$1>');
  return html;
}

function isSafeUrl(url) {
  const trimmed = url.trim().replace(/^\s*\n\s*/g, '');
  if (!trimmed) return false;
  const schemeMatch = trimmed.match(/^([a-z][a-z0-9+.-]*):/i);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase() + ':';
    const ALLOWED_URL_SCHEMES = ['http:', 'https:', 'ftp:', 'mailto:'];
    return ALLOWED_URL_SCHEMES.includes(scheme);
  }
  return true;
}

import { describe, it, expect } from 'vitest';

describe('parseMarkdown', () => {
  it('returns empty string for null/undefined', () => {
    expect(parseMarkdown(null)).toBe('');
    expect(parseMarkdown(undefined)).toBe('');
    expect(parseMarkdown('')).toBe('');
  });

  it('escapes HTML in plain text', () => {
    const result = parseMarkdown('<script>alert("xss")</script>');
    expect(result).toContain('&lt;script&gt;');
    expect(result).toContain('&lt;/script&gt;');
    expect(result).not.toContain('<script>');
  });

  it('renders bold text', () => {
    expect(parseMarkdown('**bold text**')).toContain('<strong>bold text</strong>');
  });

  it('renders italic text', () => {
    expect(parseMarkdown('*italic text*')).toContain('<em>italic text</em>');
  });

  it('renders strikethrough', () => {
    expect(parseMarkdown('~~deleted~~')).toContain('<del>deleted</del>');
  });

  it('renders inline code', () => {
    expect(parseMarkdown('use `console.log` here')).toContain('<code>console.log</code>');
  });

  it('renders code blocks', () => {
    const result = parseMarkdown('```\ncode here\n```');
    expect(result).toContain('<pre><code>');
    expect(result).toContain('code here');
    expect(result).toContain('</code></pre>');
  });

  it('renders links with safe URLs', () => {
    expect(parseMarkdown('[click here](https://example.com)')).toContain('<a href="https://example.com" target="_blank" rel="noopener">click here</a>');
  });

  it('drops unsafe URLs (javascript:)', () => {
    const result = parseMarkdown('[click](javascript:alert(1))');
    expect(result).toContain('click');
    expect(result).not.toContain('<a href="javascript:');
  });

  it('drops unsafe URLs (data:)', () => {
    const result = parseMarkdown('[click](data:text/html,<script>alert(1)</script>)');
    expect(result).toContain('click');
    expect(result).not.toContain('<a href="data:');
  });

  it('allows relative URLs', () => {
    expect(parseMarkdown('[link](/path/to/page)')).toContain('<a href="/path/to/page" target="_blank" rel="noopener">link</a>');
  });

  it('renders unordered lists', () => {
    const result = parseMarkdown('- item 1\n- item 2\n- item 3');
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>item 1</li>');
    expect(result).toContain('<li>item 2</li>');
    expect(result).toContain('<li>item 3</li>');
    expect(result).toContain('</ul>');
  });

  it('renders headers', () => {
    expect(parseMarkdown('# Header 1')).toContain('<h2>Header 1</h2>');
    expect(parseMarkdown('## Header 2')).toContain('<h3>Header 2</h3>');
    expect(parseMarkdown('### Header 3')).toContain('<h4>Header 3</h4>');
  });

  it('renders blockquotes', () => {
    expect(parseMarkdown('> quoted text')).toContain('<blockquote>quoted text</blockquote>');
  });

  it('handles line breaks', () => {
    const result = parseMarkdown('line one\nline two');
    expect(result).toContain('line one<br>line two');
  });

  it('cleans up extra <br> around block elements', () => {
    const result = parseMarkdown('- item\n\n**bold**');
    expect(result).not.toContain('<br><ul>');
    expect(result).toContain('<ul>');
  });
});
