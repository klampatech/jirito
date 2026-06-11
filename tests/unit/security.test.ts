// Tests for security-critical functions in src/utils.ts (isSafeUrl,
// escapeHtml). We import the real helpers — see phase 6 of the
// migration plan. escapeHtml needs a DOM, so vitest's jsdom
// environment (see vitest.config.ts) is required.

import { describe, it, expect } from "vitest";
import { escapeHtml, isSafeUrl } from "../../src/utils";

describe("isSafeUrl", () => {
  it("allows http URLs", () => {
    expect(isSafeUrl("http://example.com")).toBe(true);
  });

  it("allows https URLs", () => {
    expect(isSafeUrl("https://example.com")).toBe(true);
  });

  it("blocks ftp URLs (not in canonical ALLOWED_URL_SCHEMES)", () => {
    // The canonical `ALLOWED_URL_SCHEMES` in src/constants.ts is
    // ["http:", "https:", "mailto:", "tel:"]. ftp: is intentionally
    // excluded — the previous copy-pasted re-declaration in the .js
    // test file used to assert the opposite, but that test was
    // exercising a phantom that never existed in the live code.
    expect(isSafeUrl("ftp://files.example.com")).toBe(false);
  });

  it("allows tel: URLs", () => {
    expect(isSafeUrl("tel:+15551234567")).toBe(true);
  });

  it("allows mailto URLs", () => {
    expect(isSafeUrl("mailto:user@example.com")).toBe(true);
  });

  it("allows relative URLs", () => {
    expect(isSafeUrl("/path/to/page")).toBe(true);
    expect(isSafeUrl("./relative")).toBe(true);
    expect(isSafeUrl("../parent")).toBe(true);
  });

  it("blocks javascript: URLs", () => {
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("JavaScript:alert(1)")).toBe(false);
  });

  it("blocks data: URLs", () => {
    expect(isSafeUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeUrl("data:,hello")).toBe(false);
  });

  it("blocks vbscript: URLs", () => {
    expect(isSafeUrl("vbscript:msgbox(1)")).toBe(false);
  });

  it("blocks empty URLs", () => {
    expect(isSafeUrl("")).toBe(false);
    expect(isSafeUrl("   ")).toBe(false);
  });

  it("handles URLs with leading whitespace", () => {
    expect(isSafeUrl("  javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("\n\nhttps://example.com")).toBe(true);
  });
});

describe("escapeHtml", () => {
  it("escapes < and >", () => {
    expect(escapeHtml("<div>")).toBe("&lt;div&gt;");
  });

  it("escapes &", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("escapes quotes", () => {
    const result = escapeHtml('"double"');
    expect(result).toContain("double");
    expect(result).not.toContain("<");
    expect(result).not.toContain(">");
  });

  it("handles null and undefined", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });

  it("handles zero", () => {
    expect(escapeHtml(0)).toBe("0");
  });

  it("returns plain text unchanged", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("escapes complex HTML injection", () => {
    const output = escapeHtml("<img src=x onerror=alert(1)>");
    expect(output).not.toContain("<img");
    expect(output).toContain("&lt;img");
  });
});
