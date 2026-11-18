#!/usr/bin/env python3
"""Does the live e2e script itself notice a broken contract?

Runs `node scripts/e2e.mjs --sim --contract <mutant>` for several mutants from
run_mutations.py.  Every one of them must make the e2e FAIL (exit code 1).  This is the
guarantee that a green live run means something.
"""
import os
import pathlib
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
import run_mutations as rm  # noqa: E402

# mutant name prefix -> extra e2e flags
WANTED = {
    "R-bounty-is-whole-bond": [],
    "R-upheld-pays-proposer-nothing": [],
    "L-credit-skips-total": [],
    "W-withdraw-keeps-balance": [],
    "X-grant-keeps-treasury": [],
    "R-lapse-refunds-proposer": [],
    "D-tier-uses-min": [],
    "M-filing-bond-at-least": [],
    "V-validator-always-agrees": ["--chaos"],
    "X-admit-skips-count": [],
}


def main():
    env = dict(os.environ, PYTHON=sys.executable)
    bad = []
    for name, edits, count, _eq in rm.M:
        flags = next((v for k, v in WANTED.items() if name.startswith(k)), None)
        if flags is None:
            continue
        src = rm.SRC
        for old, new in edits:
            assert src.count(old) == count, name
            src = src.replace(old, new)
        work = pathlib.Path(tempfile.mkdtemp(prefix="e2e_mut_"))
        (work / "Ratchet.py").write_text(src)
        proc = subprocess.run(["node", "scripts/e2e.mjs", "--sim", "--contract", str(work / "Ratchet.py")] + flags,
                              cwd=ROOT, env=env, capture_output=True, text=True)
        failed = [l.strip() for l in proc.stdout.splitlines() if l.strip().startswith("✘")][:2]
        status = "CAUGHT" if proc.returncode == 1 else "MISSED (exit %d)" % proc.returncode
        print("%-44s %s %s" % (name[:44], status, ("- " + failed[0][:90]) if failed else ""), flush=True)
        if proc.returncode != 1:
            bad.append(name)
    print("\ne2e self-check: %d mutants, %d missed" % (sum(1 for n, *_ in rm.M if any(n.startswith(k) for k in WANTED)), len(bad)))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
