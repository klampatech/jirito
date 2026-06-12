// Tests for parseMarkdown() in src/utils.ts. parseMarkdown uses
// escapeHtml internally which requires a DOM, so vitest's jsdom
// environment (see vitest.config.ts) is required.
//
// We import the real `parseMarkdown` rather than re-declaring it —
// see phase 6 of the migration plan.

import { describe, it, expect } from "vitest";
import { parseMarkdown } from "../../src/utils";

describe("parseMarkdown", () => {
  it("returns empty string for null/undefined", () => {
    expect(parseMarkdown(null)).toBe("");
    expect(parseMarkdown(undefined)).toBe("");
    expect(parseMarkdown("")).toBe("");
  });

  it("escapes HTML in plain text", () => {
    const result = parseMarkdown('<script>alert("xss")</script>');
    expect(result).toContain("&lt;script&gt;");
    expect(result).toContain("&lt;/script&gt;");
    expect(result).not.toContain("<script>");
  });

  it("renders bold text", () => {
    expect(parseMarkdown("**bold text**")).toContain("<strong>bold text</strong>");
  });

  it("renders italic text", () => {
    expect(parseMarkdown("*italic text*")).toContain("<em>italic text</em>");
  });

  it("renders strikethrough", () => {
    expect(parseMarkdown("~~deleted~~")).toContain("<del>deleted</del>");
  });

  it("renders inline code", () => {
    expect(parseMarkdown("use `console.log` here")).toContain("<code>console.log</code>");
  });

  it("renders code blocks", () => {
    const result = parseMarkdown("```\ncode here\n```");
    expect(result).toContain("<pre><code>");
    expect(result).toContain("code here");
    expect(result).toContain("</code></pre>");
  });

  it("renders links with safe URLs", () => {
    expect(parseMarkdown("[click here](https://example.com)")).toContain(
      '<a href="https://example.com" target="_blank" rel="noopener">click here</a>',
    );
  });

  it("drops unsafe URLs (javascript:)", () => {
    const result = parseMarkdown("[click](javascript:alert(1))");
    expect(result).toContain("click");
    expect(result).not.toContain('<a href="javascript:');
  });

  it("drops unsafe URLs (data:)", () => {
    const result = parseMarkdown("[click](data:text/html,<script>alert(1)</script>)");
    expect(result).toContain("click");
    expect(result).not.toContain('<a href="data:');
  });

  it("allows relative URLs", () => {
    expect(parseMarkdown("[link](/path/to/page)")).toContain(
      '<a href="/path/to/page" target="_blank" rel="noopener">link</a>',
    );
  });

  it("renders unordered lists", () => {
    const result = parseMarkdown("- item 1\n- item 2\n- item 3");
    expect(result).toContain("<ul>");
    expect(result).toContain("<li>item 1</li>");
    expect(result).toContain("<li>item 2</li>");
    expect(result).toContain("<li>item 3</li>");
    expect(result).toContain("</ul>");
  });

  it("renders headers", () => {
    expect(parseMarkdown("# Header 1")).toContain("<h2>Header 1</h2>");
    expect(parseMarkdown("## Header 2")).toContain("<h3>Header 2</h3>");
    expect(parseMarkdown("### Header 3")).toContain("<h4>Header 3</h4>");
  });

  it("renders blockquotes", () => {
    expect(parseMarkdown("> quoted text")).toContain("<blockquote>quoted text</blockquote>");
  });

  it("handles line breaks", () => {
    expect(parseMarkdown("line one\nline two")).toContain("line one<br>line two");
  });

  it("cleans up extra <br> around block elements", () => {
    const result = parseMarkdown("- item\n\n**bold**");
    expect(result).not.toContain("<br><ul>");
    expect(result).toContain("<ul>");
  });
});
