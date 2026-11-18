#!/usr/bin/env bash
# RATCHET: one command from a fresh checkout to a live Studionet report.
#
#   bash run.sh                 setup + lint + offline tests + mutation tests + live e2e on Studionet
#   bash run.sh --fast          skip the (slow) mutation suites
#   bash run.sh --offline       everything except the live network run (uses the local sim bridge instead)
#   bash run.sh --live-only     only deploy to Studionet and run the live e2e (assumes setup already done)
#   bash run.sh --full          add the expiry scenario to the live run
#
# Pinned toolchain (GenVM v0.2.16 stable): genlayer-test 0.29.2, genvm-linter 0.11.0, genlayer-js 1.1.8.
set -euo pipefail
cd "$(dirname "$0")"

FAST=0; OFFLINE=0; LIVE_ONLY=0; FULL=0
for arg in "$@"; do
  case "$arg" in
    --fast) FAST=1 ;;
    --offline) OFFLINE=1 ;;
    --live-only) LIVE_ONLY=1 ;;
    --full) FULL=1 ;;
    -h|--help) sed -n 2,11p "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "missing required tool: $1" >&2; exit 1; }; }

need python3; need node; need npm
PYV=$(python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])')
case "$PYV" in 3.12|3.13|3.14) ;; *) echo "Python 3.12+ required (found $PYV)" >&2; exit 1 ;; esac
NODEV=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODEV" -ge 20 ] || { echo "Node 20+ required (found $(node -v))" >&2; exit 1; }

if [ "$LIVE_ONLY" -eq 0 ]; then
  step "1/6 Python toolchain (GenVM v0.2.16 tooling, pinned)"
  [ -d .venv ] || python3 -m venv .venv
  # shellcheck disable=SC1091
  . .venv/bin/activate
  python -m pip install --quiet --upgrade pip
  python -m pip install --quiet -r requirements.txt

  step "2/6 GenVM v0.2.16 artifacts and static checks"
  GENVMROOT=$(python scripts/prepare_genvm.py | tail -n 1)
  export GENVMROOT
  # the contract must be byte-clean: LF endings, no BOM
  if grep -q $'\r' contracts/Ratchet.py; then echo "CRLF found in contracts/Ratchet.py" >&2; exit 1; fi
  genvm-lint check contracts/Ratchet.py

  step "3/6 Node dependencies and script unit tests"
  npm ci --no-audit --no-fund --silent 2>/dev/null || npm install --no-audit --no-fund --silent
  npm run --silent test:scripts

  step "4/6 Direct Mode tests on the real GenVM v0.2.16 SDK"
  python -m pytest -q tests/direct

  if [ "$FAST" -eq 0 ]; then
    step "5/6 Mutation tests (the contract is broken on purpose; every break must be caught)"
    python tests/mutation/run_mutations.py --jobs "$(python -c 'import os; print(max(1, (os.cpu_count() or 2)))')"
    python tests/mutation/e2e_selfcheck.py
  else
    step "5/6 Mutation tests skipped (--fast)"
  fi
else
  [ -f .venv/bin/activate ] && . .venv/bin/activate || true
  [ -d node_modules ] || { npm ci --no-audit --no-fund --silent 2>/dev/null || npm install --no-audit --no-fund --silent; }
fi

if [ "$OFFLINE" -eq 1 ]; then
  step "6/6 End-to-end dry run on the local sim bridge (no network)"
  PYTHON="$(command -v python)" node scripts/e2e.mjs --sim --chaos
  echo; echo "report: reports/latest.md"
  exit 0
fi

step "6/6 LIVE end-to-end on GenLayer Studionet (several minutes: real consensus, real waiting windows)"
EXTRA=()
[ "$FULL" -eq 1 ] && EXTRA+=(--full)
node scripts/e2e.mjs ${EXTRA[@]+"${EXTRA[@]}"}
echo; echo "report: reports/latest.md"
