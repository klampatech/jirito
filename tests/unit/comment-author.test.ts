// Unit tests for the comment-author allowlist and the JIRITO-101
// impersonation gap fix in server/routes/_shared.ts.
//
// Burn trace (JIRITO-101, 2026-06-20): elmo posted a "Review verdict:
// PASS" comment with author="evo" because my retry brief was wrong and
// elmo rubber-stamped an existing PR instead of pushing back. The
// server's `POST /api/comments` endpoint previously accepted any
// `author` string.
//
// These tests pin the two-layer gate:
//   Layer 1 (validateCommentAuthor): the body's `author` must be in
//     VALID_AUTHORS; for verdict content, the author must additionally
//     be in REVIEWER_AUTHORS. Catches the easy "agent posted verdict
//     as themselves" case.
//   Layer 2 (validateVerdictCaller): for verdict content, the caller's
//     X-Jirito-Caller header must be in REVIEWER_AUTHORS. Catches the
//     impersonation case (agent posting verdict under a reviewer's
//     name) — the actual JIRITO-101 burn.
//
// The integration tests in tests/server.spec.mjs cover the HTTP
// surface; this file covers the pure-function helpers directly so
// the regex / set membership / header-parsing behaviour is the
// actual unit of test.

import { describe, it, expect } from "vitest";
import type { IncomingMessage } from "node:http";
import {
  VALID_AUTHORS,
  REVIEWER_AUTHORS,
  isVerdictComment,
  validateCommentAuthor,
  validateVerdictCaller,
  getCallerFromHeader,
} from "../../server/routes/_shared.js";

describe("isVerdictComment", () => {
  it("returns true for 'Review verdict: PASS' (the JIRITO-101 burn)", () => {
    expect(isVerdictComment("Review verdict: PASS — clean PR")).toBe(true);
  });

  it("returns true for 'Evo review: ...' and 'Review (rejected): ...'", () => {
    expect(isVerdictComment("Evo review: rejected, fix X")).toBe(true);
    expect(isVerdictComment("Review (rejected): scope creep")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isVerdictComment("review verdict: fail")).toBe(true);
    expect(isVerdictComment("REVIEW VERDICT: PASS")).toBe(true);
    expect(isVerdictComment("evo review: pass")).toBe(true);
  });

  it("tolerates leading whitespace", () => {
    expect(isVerdictComment("   Review verdict: PASS")).toBe(true);
    expect(isVerdictComment("\nEvo review: ...")).toBe(true);
  });

  it("returns false for plain agent comments", () => {
    expect(isVerdictComment("Working on the column-config fix.")).toBe(false);
    expect(isVerdictComment("Pushed a PR, see link.")).toBe(false);
    expect(isVerdictComment("[auto] Triaged to elmo.")).toBe(false);
  });

  it("returns false for empty / nullish content", () => {
    expect(isVerdictComment("")).toBe(false);
    expect(isVerdictComment(null)).toBe(false);
    expect(isVerdictComment(undefined)).toBe(false);
  });

  it("does NOT match 'passing judgement' or 'rejected' mid-sentence", () => {
    // The match is anchored to the start of the trimmed content.
    expect(isVerdictComment("This PR is passing judgement.")).toBe(false);
    expect(isVerdictComment("Rejected the upstream dependency.")).toBe(false);
  });
});

describe("VALID_AUTHORS", () => {
  it("contains the 4 squad agents", () => {
    for (const a of ["elmo", "bert", "ernie", "grover"]) {
      expect(VALID_AUTHORS.has(a), `expected ${a} in VALID_AUTHORS`).toBe(true);
    }
  });

  it("contains the reviewer (evo) and human (kyle)", () => {
    expect(VALID_AUTHORS.has("evo")).toBe(true);
    expect(VALID_AUTHORS.has("kyle")).toBe(true);
  });

  it("contains 'system' (used by cmd_triage synthetic comments)", () => {
    expect(VALID_AUTHORS.has("system")).toBe(true);
  });

  it("does NOT contain made-up names", () => {
    expect(VALID_AUTHORS.has("rando_xyz")).toBe(false);
    expect(VALID_AUTHORS.has("tester")).toBe(false);
    expect(VALID_AUTHORS.has("anonymous")).toBe(false);
  });
});

describe("REVIEWER_AUTHORS", () => {
  it("contains only the reviewer, the human, and the system author", () => {
    expect(REVIEWER_AUTHORS.has("evo")).toBe(true);
    expect(REVIEWER_AUTHORS.has("kyle")).toBe(true);
    expect(REVIEWER_AUTHORS.has("system")).toBe(true);
  });

  it("does NOT contain any squad agent", () => {
    for (const a of ["elmo", "bert", "ernie", "grover"]) {
      expect(
        REVIEWER_AUTHORS.has(a),
        `squad agent ${a} must NOT be a reviewer`
      ).toBe(false);
    }
  });
});

describe("validateCommentAuthor", () => {
  it("rejects missing author", () => {
    const result = validateCommentAuthor(undefined, "anything");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/author is required/);
  });

  it("rejects empty string author", () => {
    const result = validateCommentAuthor("", "anything");
    expect(result.ok).toBe(false);
  });

  it("rejects unknown author", () => {
    const result = validateCommentAuthor("rando_xyz", "hi");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/unknown author/);
  });

  it("accepts a known author with non-verdict content", () => {
    const result = validateCommentAuthor("elmo", "Working on this");
    expect(result.ok).toBe(true);
  });

  it("trims whitespace around the author", () => {
    const result = validateCommentAuthor("  elmo  ", "Working on this");
    expect(result.ok).toBe(true);
  });

  it("rejects a verdict from a squad agent (the JIRITO-101 burn)", () => {
    // This is the exact case that burned us: elmo posting a verdict
    // under any name. The author gate now refuses outright.
    const result = validateCommentAuthor(
      "elmo",
      "Review verdict: PASS — my own work, trust me"
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/verdict comments/);
  });

  it("accepts a verdict from a reviewer", () => {
    expect(
      validateCommentAuthor("evo", "Review verdict: PASS").ok
    ).toBe(true);
    expect(
      validateCommentAuthor("kyle", "Evo review: rejected, fix X").ok
    ).toBe(true);
  });

  it("accepts non-string content (won't crash on weird payloads)", () => {
    expect(validateCommentAuthor("elmo", null).ok).toBe(true);
    expect(validateCommentAuthor("elmo", undefined).ok).toBe(true);
    expect(validateCommentAuthor("elmo", 42 as unknown).ok).toBe(true);
  });
});

describe("getCallerFromHeader", () => {
  // Minimal stand-in: we only read req.headers["x-jirito-caller"], so
  // we can build a partial stub without touching other IncomingMessage
  // surface area.
  function reqWithHeader(value: string | string[] | undefined): IncomingMessage {
    return { headers: { "x-jirito-caller": value } } as unknown as IncomingMessage;
  }

  it("returns the trimmed header value when present", () => {
    expect(getCallerFromHeader(reqWithHeader("elmo"))).toBe("elmo");
    expect(getCallerFromHeader(reqWithHeader("  kyle  "))).toBe("kyle");
  });

  it("returns null when the header is missing", () => {
    expect(
      getCallerFromHeader({ headers: {} } as unknown as IncomingMessage)
    ).toBe(null);
  });

  it("returns null for empty / whitespace-only values", () => {
    expect(getCallerFromHeader(reqWithHeader(""))).toBe(null);
    expect(getCallerFromHeader(reqWithHeader("   "))).toBe(null);
  });

  it("uses the first value when the header is sent as an array", () => {
    // Node may give us an array if the client sent duplicate headers.
    // The first one wins — same semantics as most auth-bearing headers.
    expect(getCallerFromHeader(reqWithHeader(["kyle", "elmo"]))).toBe("kyle");
  });
});

describe("validateVerdictCaller", () => {
  const VERDICT = "Review verdict: PASS";
  const PLAIN = "Working on this fix.";

  // Layer 1 of the JIRITO-101 fix. Without this gate, elmo (caller)
  // could post a verdict attributed to evo (body author) and the
  // server would accept it. The body's `author` field is spoofable;
  // the X-Jirito-Caller header is set by the CLI / agent harness and
  // identifies the system actually making the request.

  it("passes non-verdict content regardless of caller (no caller check needed)", () => {
    expect(validateVerdictCaller(null, PLAIN).ok).toBe(true);
    expect(validateVerdictCaller("elmo", PLAIN).ok).toBe(true);
    expect(validateVerdictCaller("kyle", PLAIN).ok).toBe(true);
  });

  it("rejects a verdict with no caller header (header required for verdicts)", () => {
    const result = validateVerdictCaller(null, VERDICT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/X-Jirito-Caller/);
    }
  });

  it("rejects a verdict with an empty caller header", () => {
    // getCallerFromHeader returns null for empty strings, but a raw
    // empty string here covers the "header parser bug" defense-in-depth.
    const result = validateVerdictCaller("", VERDICT);
    expect(result.ok).toBe(false);
  });

  it("rejects a verdict with a squad agent as caller (the JIRITO-101 burn)", () => {
    // elmo is in VALID_AUTHORS (can post regular comments) but NOT in
    // REVIEWER_AUTHORS. The JIRITO-101 burn: elmo posted a verdict
    // attributed to evo. The body author passed Layer 1; the caller
    // gate is what actually closes it.
    for (const agent of ["elmo", "bert", "ernie", "grover"]) {
      const result = validateVerdictCaller(agent, VERDICT);
      expect(result.ok, `agent ${agent} must be rejected`).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/reviewer caller/);
        expect(result.error).toContain(agent);
      }
    }
  });

  it("accepts a verdict from each reviewer-class caller", () => {
    for (const caller of ["evo", "kyle", "system"]) {
      const result = validateVerdictCaller(caller, VERDICT);
      expect(result.ok, `reviewer ${caller} must be accepted`).toBe(true);
    }
  });

  it("rejects a verdict with an unknown caller (defense-in-depth)", () => {
    const result = validateVerdictCaller("rando_xyz", VERDICT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/reviewer caller/);
  });

  it("recognises all verdict prefixes (each blocks non-reviewer callers)", () => {
    // Same regex coverage as the body's author gate, but on the
    // caller side. The point of these tests is "the gate fires
    // before the body is checked" — caller=elmo fails for ANY
    // verdict content, regardless of body's author.
    const variants = [
      "Review verdict: PASS",
      "Review verdict: FAIL — scope creep",
      "Evo review: rejected, fix X",
      "Review (rejected): send back",
    ];
    for (const v of variants) {
      expect(
        validateVerdictCaller("elmo", v).ok,
        `variant ${JSON.stringify(v)} must reject caller=elmo`
      ).toBe(false);
      expect(
        validateVerdictCaller("kyle", v).ok,
        `variant ${JSON.stringify(v)} must accept caller=kyle`
      ).toBe(true);
    }
  });
});
