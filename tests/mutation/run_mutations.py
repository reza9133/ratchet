#!/usr/bin/env python3
"""Mutation testing: deliberately break the contract and demand that the tests notice.

Each mutant is a one-place edit of contracts/Ratchet.py.  A mutant is KILLED when the
Direct Mode suite fails against it.  The most important group (V-*) weakens the
validator's exact-equality rule (tolerance, adjacent tiers, ignored booleans, accepted
leader errors ...): every one of those MUST be killed.  Mutants flagged `equivalent`
change nothing observable (defense in depth) and are expected to survive.

usage:  python tests/mutation/run_mutations.py [--jobs N] [--only PREFIX] [--with-fuzz]
"""
import argparse
import concurrent.futures as cf
import os
import pathlib
import re
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = (ROOT / "contracts" / "Ratchet.py").read_text()

# (name, old, new, count, equivalent?)
M = []


def mutant(name, old, new, count=1, equivalent=False):
    """`old`/`new` may be lists of the same length to apply several edits as ONE mutant."""
    olds = old if isinstance(old, list) else [old]
    news = new if isinstance(new, list) else [new]
    assert len(olds) == len(news)
    M.append((name, list(zip(olds, news)), count, equivalent))


# ---- the critical rule: validators must demand exact equality ------------------------------ #
VALIDATOR_TAIL = '''        if proposed["touches"] != mine["touches"]:
            return False
        if proposed["tier"] != mine["tier"]:
            return False
        return True'''
mutant("V-old-tolerance-pattern (touches ignored, +-1 tier accepted)", VALIDATOR_TAIL,
       '''        if abs(proposed["tier"] - mine["tier"]) > 1:
            return False
        return True''')
mutant("V-booleans-ignored (tier-only equality)", '''        if proposed["touches"] != mine["touches"]:
            return False
''', '')
mutant("V-tier-equality-dropped (touches only)", '''        if proposed["tier"] != mine["tier"]:
            return False
''', '', equivalent=True)
mutant("V-no-tier-defense (tier compare AND consistency check both gone)",
       ['''        if proposed["tier"] != mine["tier"]:
            return False
''', '''    return candidate["tier"] == derive_tier(floor, touches, tiers)'''],
       ['''''', '''    return True'''])
mutant("V-accepts-leader-error", '''        if not isinstance(leader_result, gl.vm.Return):
            return False''', '''        if not isinstance(leader_result, gl.vm.Return):
            return True''')
mutant("V-swallows-validator-failure", '''        except Exception:
            return False
        if proposed["touches"]''', '''        except Exception:
            return True
        if proposed["touches"]''')
mutant("V-compares-free-text-too", 'if proposed["tier"] != mine["tier"]:',
       'if proposed["tier"] != mine["tier"] or proposed["reason"] != mine["reason"]:')
mutant("V-validator-always-agrees", 'result = gl.vm.run_nondet_unsafe(leader, validator)',
       'result = gl.vm.run_nondet_unsafe(leader, lambda _r: True)')
mutant("V-no-structural-check", '''        if not well_formed(proposed, other_ids, tiers, floor):
            return False
        try:''', '''        try:''')
mutant("N-ints-accepted-as-booleans", '''        if type(value) is not bool:
            return None''', '''        if value not in (True, False):
            return None''')
mutant("N-extra-keys-allowed", '''    if set(touches.keys()) != set(other_ids):
        return None''', '''    if not set(other_ids) <= set(touches.keys()):
        return None''')
mutant("N-missing-keys-allowed", '''    if set(touches.keys()) != set(other_ids):
        return None
    clean = {}
    for article_id in sorted(other_ids):
        value = touches[article_id]''', '''    clean = {}
    for article_id in sorted(other_ids):
        value = touches.get(article_id, False)''')
mutant("WF-consistency-check-dropped", '''    return candidate["tier"] == derive_tier(floor, touches, tiers)''', '''    return True''', equivalent=False)
mutant("D-tier-uses-min", 'tier = max(tier, int(tiers[article_id]))', 'tier = min(tier, int(tiers[article_id]))')
mutant("D-touched-ignored", '        if touches[article_id] is True:', '        if touches[article_id] is False:')

# ---- thresholds -------------------------------------------------------------------------- #
mutant("T-tier3-off-by-one", 'return (4 * n + 4) // 5', 'return (4 * n + 3) // 5')
mutant("T-tier4-not-unanimous", '''    if t == 4:
        return n''', '''    if t == 4:
        return n - 1''')
mutant("T-tier1-not-strict-majority", 'return n // 2 + 1', 'return (n + 1) // 2')
mutant("T-tier2-off-by-one", 'return (2 * n + 2) // 3', 'return (2 * n + 1) // 3')

# ---- money routing / bonds ---------------------------------------------------------------- #
mutant("M-filing-bond-at-least", '''            raise gl.vm.UserError("the floor is held by another motion")
        if self._value() != int(self.bond):''', '''            raise gl.vm.UserError("the floor is held by another motion")
        if self._value() < int(self.bond):''')
mutant("M-challenge-bond-at-least", '''            raise gl.vm.UserError("not on the frozen roster")
        if self._value() != int(self.bond):''', '''            raise gl.vm.UserError("not on the frozen roster")
        if self._value() < int(self.bond):''')
mutant("R-ratchet-can-lower", 'merged[article_id] = bool(flag) or bool(motion["touches"][article_id])',
       'merged[article_id] = bool(flag)')
mutant("R-raised-on-equal-tier", 'raised = new_tier > old_tier', 'raised = new_tier >= old_tier')
mutant("R-bounty-is-whole-bond", 'bounty = motion["bond_left"] // 2', 'bounty = motion["bond_left"]')
mutant("R-proposer-may-challenge", '''        if who == motion["proposer"]:
            raise gl.vm.UserError("proposer cannot challenge own motion")''', '        pass')
mutant("R-upheld-pays-proposer-nothing", 'to_proposer = bond // 2', 'to_proposer = 0')
mutant("R-lapse-refunds-proposer", 'self._to_treasury(motion["bond_left"])',
       'self._credit(motion["proposer"], motion["bond_left"])')
mutant("L-credit-skips-total", '''        self.claimable_total = u256(int(self.claimable_total) + amount)
''', '')
mutant("W-withdraw-keeps-balance", '        self.claimable[who] = u256(0)\n', '')
mutant("E-bounced-payout-vanishes", '        self._to_treasury(self._value())\n\n    # ----', '        pass\n\n    # ----')

# ---- state machine ---------------------------------------------------------------------- #
mutant("F-no-floor-lock", '''        if int(self.floor_motion) != 0:
            raise gl.vm.UserError("the floor is held by another motion")''', '        pass')
mutant("V-double-voting", '''        if self.votes.get(key, u8(0)) != 0:
            raise gl.vm.UserError("already voted")''', '        pass')
mutant("V-early-pass-allowed", 'if not (everyone_voted or now >= motion["vote_deadline"]',
       'if not (passed or everyone_voted or now >= motion["vote_deadline"]')
mutant("V-hopeless-ignores-participation", '(hopeless and participation * 2 >= n)', 'hopeless')
mutant("V-lapse-at-half", 'if participation * 2 < n:', 'if participation * 2 <= n:')
mutant("V-deadline-exclusive-off", '''        if self._now() >= motion["vote_deadline"]:
            raise gl.vm.UserError("voting deadline passed")''', '''        if self._now() > motion["vote_deadline"]:
            raise gl.vm.UserError("voting deadline passed")''')
mutant("C-window-closes-early", '''        if self._now() > motion["contest_deadline"]:
            raise gl.vm.UserError("contest window closed")''', '''        if self._now() >= motion["contest_deadline"]:
            raise gl.vm.UserError("contest window closed")''')
mutant("C-finalize-at-deadline", 'self._now() <= motion["contest_deadline"]:', 'self._now() < motion["contest_deadline"]:')
mutant("G-floor-half-boundary", 'elif amount * 2 <= treasury:', 'elif amount * 2 < treasury:')
mutant("G-floor-tenth-boundary", 'if amount * 10 <= treasury:', 'if amount * 10 < treasury:')
mutant("S-stale-window-wrong-param", '"stale_at": now + int(self.vote_minutes) * 60,', '"stale_at": now + int(self.challenge_minutes) * 60,')
mutant("S-contest-window-wrong-param", 'motion["contest_deadline"] = now + int(self.challenge_minutes) * 60',
       'motion["contest_deadline"] = now + int(self.vote_minutes) * 60')
mutant("S-vote-window-wrong-param", 'motion["vote_deadline"] = now + int(self.vote_minutes) * 60',
       'motion["vote_deadline"] = now + int(self.challenge_minutes) * 60')
mutant("A-classify-open-to-outsiders", 'self._require_member(self._actor())', 'pass')
mutant("D-frozen-digest-unchecked", '''        if hashlib.sha256(evidence.encode("utf-8")).hexdigest() != motion["digest"]:
            raise gl.vm.UserError("frozen evidence digest mismatch")''', '        pass', count=2)
mutant("X-expel-keeps-member", '            del self.members[member]\n', '')
mutant("X-admit-skips-count", '            self.member_count = u32(int(self.member_count) + 1)\n            return "ENACTED"',
       '            return "ENACTED"')
mutant("X-grant-keeps-treasury", '            self.treasury = u256(int(self.treasury) - amount)\n', '')


def run_one(args):
    idx, (name, edits, count, equivalent), with_fuzz = args
    mutated = SRC
    for old, new in edits:
        if mutated.count(old) != count:
            return name, "BROKEN", "snippet occurs %d times, expected %d" % (mutated.count(old), count), equivalent
        mutated = mutated.replace(old, new)
    try:
        compile(mutated, "Ratchet.py", "exec")
    except SyntaxError as exc:
        return name, "BROKEN", "mutant does not compile: %s" % exc, equivalent
    work = pathlib.Path(tempfile.mkdtemp(prefix="ratchet_mut_%d_" % idx))
    (work / "Ratchet.py").write_text(mutated)
    env = dict(os.environ, RATCHET_CONTRACT=str(work / "Ratchet.py"))
    cmd = [sys.executable, "-m", "pytest", "-x", "-q", "-p", "no:cacheprovider", str(ROOT / "tests" / "direct")]
    if not with_fuzz:
        cmd += ["--ignore", str(ROOT / "tests" / "direct" / "test_fuzz.py")]
    proc = subprocess.run(cmd, cwd=ROOT, env=env, capture_output=True, text=True)
    out = proc.stdout + proc.stderr
    if proc.returncode == 0:
        return name, "SURVIVED", "", equivalent
    if "Failed to load contract" in out and "ImportError" in out:
        return name, "BROKEN", "mutant failed to import", equivalent
    first = next((l for l in out.splitlines() if l.startswith("FAILED") or l.startswith("ERROR")), "failed")
    return name, "KILLED", first[:140], equivalent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 2) // 1))
    ap.add_argument("--only", default="")
    ap.add_argument("--with-fuzz", action="store_true")
    ns = ap.parse_args()
    todo = [(i, m, ns.with_fuzz) for i, m in enumerate(M) if ns.only in m[0]]
    results = []
    with cf.ThreadPoolExecutor(max_workers=ns.jobs) as pool:
        for res in pool.map(run_one, todo):
            results.append(res)
            name, status, detail, equivalent = res
            tag = status if not (equivalent and status == "SURVIVED") else "SURVIVED (equivalent, expected)"
            print("%-62s %s" % (name, tag), ("- " + detail) if status != "SURVIVED" and detail else "", flush=True)
    killed = sum(1 for r in results if r[1] == "KILLED")
    broken = [r for r in results if r[1] == "BROKEN"]
    bad = [r for r in results if r[1] == "SURVIVED" and not r[3]]
    expected = [r for r in results if r[1] == "SURVIVED" and r[3]]
    print("\nmutants: %d  killed: %d  survived(unexpected): %d  survived(equivalent): %d  broken: %d"
          % (len(results), killed, len(bad), len(expected), len(broken)))
    for r in bad:
        print("  UNEXPECTED SURVIVOR:", r[0])
    for r in broken:
        print("  BROKEN MUTANT DEFINITION:", r[0], r[2])
    return 1 if (bad or broken) else 0


if __name__ == "__main__":
    sys.exit(main())
