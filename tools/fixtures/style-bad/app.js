// ── Header ──────────────────────────────────────────────────────────────────
// Fixture for tools/check-conformance.mjs: an app that breaks CODE-STYLE.md.

// ── Constants ───────────────────────────────────────────────────────────────

const STORAGE = { intro: 'seen-intro' };

// ── Boot ────────────────────────────────────────────────────────────────────

// Waits for the map (kit 0.21.0), as Kyle asked on 2026-11-04.
init();

// ── Map ─────────────────────────────────────────────────────────────────────

/* The old popup is no longer here. */
function init() {
  return STORAGE;
}
