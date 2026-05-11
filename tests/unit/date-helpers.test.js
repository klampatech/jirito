// Tests for date helper functions

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;

const CALENDAR_MAX_ROWS = 6;

function isOverdue(dueDate, status) {
  if (!dueDate || status === 'done') return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 0) return 'In the future';
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  return days + 'd ago';
}

function getCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = firstDay.getDay();
  const days = [];
  // Previous month padding
  for (let i = startDay - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d, isCurrentMonth: false, dueIssues: [] });
  }
  // Current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dueIssues = [];
    days.push({ date: new Date(year, month, d), isCurrentMonth: true, dateStr, dueIssues });
  }
  // Next month padding
  const remaining = CALENDAR_MAX_ROWS * 7 - days.length;
  for (let d = 1; d <= remaining; d++) {
    const date = new Date(year, month + 1, d);
    days.push({ date, isCurrentMonth: false, dueIssues: [] });
  }
  return days;
}

import { describe, it, expect } from 'vitest';

describe('isOverdue', () => {
  it('returns false for null dueDate', () => {
    expect(isOverdue(null, 'todo')).toBe(false);
    expect(isOverdue(undefined, 'todo')).toBe(false);
  });

  it('returns false for done status regardless of date', () => {
    const pastDate = '2020-01-01';
    expect(isOverdue(pastDate, 'done')).toBe(false);
  });

  it('returns false for future dueDate', () => {
    const futureDate = '2099-12-31';
    expect(isOverdue(futureDate, 'todo')).toBe(false);
  });

  it('returns true for past dueDate with non-done status', () => {
    const pastDate = '2020-01-01';
    expect(isOverdue(pastDate, 'todo')).toBe(true);
    expect(isOverdue(pastDate, 'inprogress')).toBe(true);
    expect(isOverdue(pastDate, 'review')).toBe(true);
  });
});

describe('formatDate', () => {
  it('returns "Today" for today\'s date', () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(formatDate(dateStr)).toBe('Today');
  });

  it('returns "Tomorrow" for tomorrow\'s date', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    expect(formatDate(dateStr)).toBe('Tomorrow');
  });

  it('returns "Yesterday" for yesterday\'s date', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    expect(formatDate(dateStr)).toBe('Yesterday');
  });

  it('returns formatted date for other dates', () => {
    const result = formatDate('2025-06-15');
    expect(result).toBe('Jun 15');
  });
});

describe('timeAgo', () => {
  it('returns "just now" for less than 60 seconds ago', () => {
    const recent = new Date(Date.now() - 30000);
    expect(timeAgo(recent)).toBe('just now');
  });

  it('returns minutes ago for 1-59 minutes', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    expect(timeAgo(fiveMinAgo)).toBe('5m ago');
  });

  it('returns hours ago for 1-23 hours', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    expect(timeAgo(threeHoursAgo)).toBe('3h ago');
  });

  it('returns days ago for 1+ days', () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    expect(timeAgo(fiveDaysAgo)).toBe('5d ago');
  });

  it('returns "In the future" for future dates', () => {
    const future = new Date(Date.now() + 1000 * 60 * 60);
    expect(timeAgo(future)).toBe('In the future');
  });
});

describe('getCalendarDays', () => {
  it('returns 42 days (6 rows x 7 cols)', () => {
    const days = getCalendarDays(2025, 0);
    expect(days.length).toBe(42);
  });

  it('includes current month days', () => {
    const days = getCalendarDays(2025, 0);
    const currentMonthDays = days.filter(d => d.isCurrentMonth);
    expect(currentMonthDays.length).toBe(31); // January has 31 days
  });

  it('includes previous month padding', () => {
    const days = getCalendarDays(2025, 0);
    const prevMonthDays = days.filter(d => !d.isCurrentMonth && d.date.getMonth() === 11);
    expect(prevMonthDays.length).toBeGreaterThan(0);
  });

  it('includes next month padding', () => {
    const days = getCalendarDays(2025, 0);
    const nextMonthDays = days.filter(d => !d.isCurrentMonth && d.date.getMonth() === 1);
    expect(nextMonthDays.length).toBeGreaterThan(0);
  });

  it('has correct dateStr format', () => {
    const days = getCalendarDays(2025, 0);
    const currentDays = days.filter(d => d.isCurrentMonth);
    expect(currentDays[0].dateStr).toBe('2025-01-01');
  });

  it('handles February correctly', () => {
    const days = getCalendarDays(2024, 1); // Feb 2024 (leap year)
    const currentMonthDays = days.filter(d => d.isCurrentMonth);
    expect(currentMonthDays.length).toBe(29);
  });
});
