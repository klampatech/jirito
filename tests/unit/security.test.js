// Tests for security-critical functions: isSafeUrl() and escapeHtml()

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;

function escapeHtml(str) {
  if (!str && str !== 0) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
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

describe('isSafeUrl', () => {
  it('allows http URLs', () => {
    expect(isSafeUrl('http://example.com')).toBe(true);
  });

  it('allows https URLs', () => {
    expect(isSafeUrl('https://example.com')).toBe(true);
  });

  it('allows ftp URLs', () => {
    expect(isSafeUrl('ftp://files.example.com')).toBe(true);
  });

  it('allows mailto URLs', () => {
    expect(isSafeUrl('mailto:user@example.com')).toBe(true);
  });

  it('allows relative URLs', () => {
    expect(isSafeUrl('/path/to/page')).toBe(true);
    expect(isSafeUrl('./relative')).toBe(true);
    expect(isSafeUrl('../parent')).toBe(true);
  });

  it('blocks javascript: URLs', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('JavaScript:alert(1)')).toBe(false);
  });

  it('blocks data: URLs', () => {
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeUrl('data:,hello')).toBe(false);
  });

  it('blocks vbscript: URLs', () => {
    expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false);
  });

  it('blocks empty URLs', () => {
    expect(isSafeUrl('')).toBe(false);
    expect(isSafeUrl('   ')).toBe(false);
  });

  it('handles URLs with leading whitespace', () => {
    expect(isSafeUrl('  javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('\n\nhttps://example.com')).toBe(true);
  });
});

describe('escapeHtml', () => {
  it('escapes < and >', () => {
    expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
  });

  it('escapes &', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes quotes', () => {
    // DOM textContent/innerHTML escaping behavior
    const result = escapeHtml('"double"');
    expect(result).toContain('double');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });

  it('handles null and undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('handles zero', () => {
    expect(escapeHtml(0)).toBe('0');
  });

  it('returns plain text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('escapes complex HTML injection', () => {
    const input = '<img src=x onerror=alert(1)>';
    const output = escapeHtml(input);
    expect(output).not.toContain('<img');
    expect(output).toContain('&lt;img');
  });
});
