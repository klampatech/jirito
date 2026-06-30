// Tests for profile localStorage helpers in src/main-profile.ts.
//
// Verifies:
//   - getDisplayName() / setDisplayName() round-trip
//   - getAvatarInitial() derives correct initial or falls back to "K"
//   - empty name is handled (returns "", removes item, initial falls back to "K")

import { describe, it, expect, beforeEach } from "vitest";

// ── localStorage mock (jsdom doesn't implement Storage) ──────────────────────
const store: Record<string, string> = {};
const mockLS = {
  getItem: (key: string) => (key in store ? store[key] : null),
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
};

Object.defineProperty(globalThis, "localStorage", { value: mockLS });

// ── import helpers after mock is in place ─────────────────────────────────────
import { getDisplayName, setDisplayName, getAvatarInitial } from "../../src/main-profile.js";

describe("profile localStorage helpers", () => {
  beforeEach(() => {
    mockLS.clear();
  });

  describe("getDisplayName / setDisplayName", () => {
    it("returns empty string when nothing is saved", () => {
      expect(getDisplayName()).toBe("");
    });

    it("saves and retrieves a name", () => {
      setDisplayName("Alice");
      expect(getDisplayName()).toBe("Alice");
    });

    it("trims whitespace on save", () => {
      setDisplayName("  Bob  ");
      expect(getDisplayName()).toBe("Bob");
    });

    it("removes item when given an all-whitespace name", () => {
      setDisplayName("   ");
      expect(getDisplayName()).toBe("");
      expect(mockLS.getItem("jirito_display_name")).toBeNull();
    });

    it("removes item when given an empty string", () => {
      setDisplayName("");
      expect(getDisplayName()).toBe("");
      expect(mockLS.getItem("jirito_display_name")).toBeNull();
    });
  });

  describe("getAvatarInitial", () => {
    it("falls back to 'K' when no name is saved", () => {
      expect(getAvatarInitial()).toBe("K");
    });

    it("returns uppercase first letter of saved name", () => {
      setDisplayName("alice");
      expect(getAvatarInitial()).toBe("A");
    });

    it("returns uppercase first letter even for mixed-case input", () => {
      setDisplayName("bOb");
      expect(getAvatarInitial()).toBe("B");
    });

    it("falls back to 'K' for whitespace-only name", () => {
      setDisplayName("   ");
      expect(getAvatarInitial()).toBe("K");
    });
  });
});
