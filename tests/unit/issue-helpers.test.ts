// Tests for issue helper functions in src/utils.ts (generateIssueKey,
// lucideIcon). We import the real helpers rather than re-declaring
// them — see phase 6 of the migration plan.

import { describe, it, expect } from "vitest";
import { generateIssueKey, lucideIcon } from "../../src/utils";

describe("generateIssueKey", () => {
  it("generates key with uppercase project key", () => {
    expect(generateIssueKey("phx", 1)).toBe("PHX-1");
  });

  it("handles lowercase project key", () => {
    expect(generateIssueKey("project", 42)).toBe("PROJECT-42");
  });

  it("handles uppercase project key", () => {
    expect(generateIssueKey("PROJ", 100)).toBe("PROJ-100");
  });

  it("handles zero id", () => {
    expect(generateIssueKey("TEST", 0)).toBe("TEST-0");
  });

  it("handles large ids", () => {
    expect(generateIssueKey("ABC", 999_999)).toBe("ABC-999999");
  });
});

describe("lucideIcon", () => {
  it("converts PascalCase to kebab-case", () => {
    expect(lucideIcon("Plus")).toContain("ph-plus");
  });

  it("handles multi-word PascalCase", () => {
    expect(lucideIcon("FileText")).toContain("ph-file-text");
  });

  it("handles single character names", () => {
    expect(lucideIcon("X")).toContain("ph-x");
  });

  it("includes custom attributes", () => {
    const result = lucideIcon("Plus", { class: "icon-sm" });
    expect(result).toContain("ph ph-plus");
    expect(result).toContain("icon-sm");
  });

  it("handles multiple custom attributes", () => {
    const result = lucideIcon("Plus", { class: "icon-sm", title: "Add" });
    expect(result).toContain("ph ph-plus");
    expect(result).toContain("icon-sm");
    expect(result).toContain('title="Add"');
  });

  it("returns valid HTML string", () => {
    expect(lucideIcon("Plus")).toMatch(/^<i class="ph ph-plus"[^>]*><\/i>$/);
  });

  it("handles icon with no attrs", () => {
    expect(lucideIcon("Plus", {})).toMatch(/^<i class="ph ph-plus"[^>]*><\/i>$/);
  });
});
