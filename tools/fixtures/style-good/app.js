// ── Header ──────────────────────────────────────────────────────────────────
// Fixture for tools/check-conformance.mjs: an app that follows CODE-STYLE.md.

// ── Config ──────────────────────────────────────────────────────────────────

const STORAGE = { intro: 'mco-fixture-seen-intro' };
// Strings and regex literals are not comments: none of these is history.
const NOTES = ['https://example.org//v1.2.3/', "kit 0.21.0 used to", `2026-11-04 no longer`];
const QUOTE = /'/g;

// ── Map ─────────────────────────────────────────────────────────────────────

// ─ Layers
// A WCAG 1.4.11 contrast note and a §5.8 reference are not versions.
export function draw() {
  return [STORAGE, NOTES, QUOTE];
}

// ── Boot ────────────────────────────────────────────────────────────────────

draw();
