// Tests for date helper functions in src/utils.ts.
//
// We import the real helpers from `../../src/utils` rather than
// re-declaring them in the test file. This is the whole point of phase 6:
// the previous copies drifted out of sync with the canonical
// implementations (different `formatDate` edge cases, different
// `getCalendarDays` padding math, etc.).
//
// `getCalendarDays` in `src/utils.ts` reads the current issues via the
// legacy `getIssues()` global. In the browser this is provided by
// `state.js`; in the unit-test env nothing supplies it, so we stub it
// on `globalThis` before any test that exercises the calendar runs.

import { describe, it, expect, beforeAll } from "vitest";
import { getCalendarDays, formatDate, isOverdue, timeAgo } from "../../src/utils";

beforeAll(() => {
  // Provide the state global that src/utils.ts `declare function getIssues`
  // references at runtime. The calendar test only inspects structure
  // (length, isCurrentMonth, dateStr), so an empty array is sufficient.
  (globalThis as unknown as { getIssues: () => unknown[] }).getIssues = () => [];
});

describe("isOverdue", () => {
  it("returns false for null dueDate", () => {
    expect(isOverdue(null, "todo")).toBe(false);
    expect(isOverdue(undefined, "todo")).toBe(false);
  });

  it("returns false for done status regardless of date", () => {
    expect(isOverdue("2020-01-01", "done")).toBe(false);
  });

  it("returns false for future dueDate", () => {
    expect(isOverdue("2099-12-31", "todo")).toBe(false);
  });

  it("returns true for past dueDate with non-done status", () => {
    expect(isOverdue("2020-01-01", "todo")).toBe(true);
    expect(isOverdue("2020-01-01", "inprogress")).toBe(true);
    expect(isOverdue("2020-01-01", "review")).toBe(true);
  });
});

describe("formatDate", () => {
  it('returns "Today" for today\'s date', () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    expect(formatDate(dateStr)).toBe("Today");
  });

  it('returns "Tomorrow" for tomorrow\'s date', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    expect(formatDate(dateStr)).toBe("Tomorrow");
  });

  it('returns "Yesterday" for yesterday\'s date', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
    expect(formatDate(dateStr)).toBe("Yesterday");
  });

  it("returns formatted date for other dates", () => {
    expect(formatDate("2025-06-15")).toBe("Jun 15");
  });
});

describe("timeAgo", () => {
  it('returns "just now" for less than 60 seconds ago', () => {
    const recent = new Date(Date.now() - 30_000);
    expect(timeAgo(recent)).toBe("just now");
  });

  it("returns minutes ago for 1-59 minutes", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    expect(timeAgo(fiveMinAgo)).toBe("5m ago");
  });

  it("returns hours ago for 1-23 hours", () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    expect(timeAgo(threeHoursAgo)).toBe("3h ago");
  });

  it("returns days ago for 1+ days", () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    expect(timeAgo(fiveDaysAgo)).toBe("5d ago");
  });

  it('returns "In the future" for future dates', () => {
    const future = new Date(Date.now() + 1000 * 60 * 60);
    expect(timeAgo(future)).toBe("In the future");
  });
});

describe("getCalendarDays", () => {
  it("returns 42 days (6 rows x 7 cols)", () => {
    expect(getCalendarDays(2025, 0).length).toBe(42);
  });

  it("includes current month days", () => {
    const currentMonthDays = getCalendarDays(2025, 0).filter((d) => d.isCurrentMonth);
    expect(currentMonthDays.length).toBe(31); // January has 31 days
  });

  it("includes previous month padding", () => {
    const prevMonthDays = getCalendarDays(2025, 0).filter(
      (d) => !d.isCurrentMonth && d.date.getMonth() === 11,
    );
    expect(prevMonthDays.length).toBeGreaterThan(0);
  });

  it("includes next month padding", () => {
    const nextMonthDays = getCalendarDays(2025, 0).filter(
      (d) => !d.isCurrentMonth && d.date.getMonth() === 1,
    );
    expect(nextMonthDays.length).toBeGreaterThan(0);
  });

  it("has correct dateStr format", () => {
    const currentDays = getCalendarDays(2025, 0).filter((d) => d.isCurrentMonth);
    expect(currentDays[0].dateStr).toBe("2025-01-01");
  });

  it("handles February correctly (leap year)", () => {
    const currentMonthDays = getCalendarDays(2024, 1).filter((d) => d.isCurrentMonth);
    expect(currentMonthDays.length).toBe(29);
  });
});
