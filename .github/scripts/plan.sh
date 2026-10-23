#!/usr/bin/env bash
# Decide whether a browser workflow (canary, a11y) runs, and in which engines.
# Writes `run`, `browsers` (JSON array) and `engines` (comma list) to
# $GITHUB_OUTPUT and a one-line reason to the job summary.
#
#   pull_request       runs only if a changed file matches $PATHS_RE.
#                      Chromium, plus WebKit when the PR is a release
#                      candidate: title starts "vX.Y.Z" (the release-PR
#                      convention, e.g. "v0.15.1: …") or it carries the
#                      `release` label.
#   workflow_dispatch  always runs; engines from the `engines` input.
#   push               always runs; both engines on a tag, Chromium otherwise.
#
# Env: EVENT, REF, PATHS_RE, PR_NUMBER, PR_TITLE, PR_LABELS (JSON array of
# names), INPUT_ENGINES, GH_TOKEN, GITHUB_REPOSITORY.
set -euo pipefail

run=true
engines=chromium
reason=''

case "$EVENT" in
  pull_request)
    changed=$(gh api "repos/$GITHUB_REPOSITORY/pulls/$PR_NUMBER/files" --paginate --jq '.[].filename')
    hits=$(grep -E "$PATHS_RE" <<<"$changed" || true)
    if [[ -z "$hits" ]]; then
      run=false
      reason="no published or audited path changed ($(wc -l <<<"$changed" | tr -d ' ') file(s): $(head -5 <<<"$changed" | paste -sd ' ' -))"
    else
      reason="matched: $(head -5 <<<"$hits" | paste -sd ' ' -)"
      if [[ "$PR_TITLE" =~ ^v[0-9]+\.[0-9]+\.[0-9]+ ]] || jq -e 'index("release")' <<<"$PR_LABELS" > /dev/null; then
        engines=chromium,webkit
        reason="release candidate; $reason"
      fi
    fi
    ;;
  workflow_dispatch)
    engines=${INPUT_ENGINES:-chromium,webkit}
    reason="manual dispatch"
    ;;
  push)
    [[ "$REF" == refs/tags/* ]] && engines=chromium,webkit
    reason="push to $REF"
    ;;
  *)
    echo "::error::plan.sh: unhandled event $EVENT"; exit 1 ;;
esac

engines=$(tr -d ' ' <<<"$engines")
browsers=$(jq -cn --arg e "$engines" '$e | split(",") | map(select(. != ""))')
[[ "$browsers" == '[]' ]] && { echo "::error::no engines selected"; exit 1; }

{
  echo "run=$run"
  echo "engines=$engines"
  echo "browsers=$browsers"
} >> "$GITHUB_OUTPUT"
echo "run=$run engines=$engines — $reason" | tee -a "$GITHUB_STEP_SUMMARY"
