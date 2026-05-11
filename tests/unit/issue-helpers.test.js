// Tests for issue helper functions

import { describe, it, expect } from 'vitest';

function generateIssueKey(projectKey, id) {
  return `${projectKey.toUpperCase()}-${id}`;
}

function lucideIcon(name, attrs = {}) {
  const kebabName = name
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
  const className = 'ph ph-' + kebabName;
  const iconAttrs = Object.entries(attrs)
    .map(([k, v]) => k + '="' + v + '"')
    .join(' ');
  return '<i class="' + className + '" ' + iconAttrs + '></i>';
}

describe('generateIssueKey', () => {
  it('generates key with uppercase project key', () => {
    expect(generateIssueKey('phx', 1)).toBe('PHX-1');
  });

  it('handles lowercase project key', () => {
    expect(generateIssueKey('project', 42)).toBe('PROJECT-42');
  });

  it('handles uppercase project key', () => {
    expect(generateIssueKey('PROJ', 100)).toBe('PROJ-100');
  });

  it('handles zero id', () => {
    expect(generateIssueKey('TEST', 0)).toBe('TEST-0');
  });

  it('handles large ids', () => {
    expect(generateIssueKey('ABC', 999999)).toBe('ABC-999999');
  });
});

describe('lucideIcon', () => {
  it('converts PascalCase to kebab-case', () => {
    const result = lucideIcon('Plus');
    expect(result).toContain('ph-plus');
  });

  it('handles multi-word PascalCase', () => {
    const result = lucideIcon('FileText');
    expect(result).toContain('ph-file-text');
  });

  it('handles single character names', () => {
    const result = lucideIcon('X');
    expect(result).toContain('ph-x');
  });

  it('includes custom attributes', () => {
    const result = lucideIcon('Plus', { class: 'icon-sm' });
    expect(result).toContain('ph ph-plus');
    expect(result).toContain('icon-sm');
  });

  it('handles multiple custom attributes', () => {
    const result = lucideIcon('Plus', { class: 'icon-sm', title: 'Add' });
    expect(result).toContain('ph ph-plus');
    expect(result).toContain('icon-sm');
    expect(result).toContain('title="Add"');
  });

  it('returns valid HTML string', () => {
    const result = lucideIcon('Plus');
    expect(result).toMatch(/^<i class="ph ph-plus"[^>]*><\/i>$/);
  });

  it('handles icon with no attrs', () => {
    const result = lucideIcon('Plus', {});
    expect(result).toMatch(/^<i class="ph ph-plus"[^>]*><\/i>$/);
  });
});
