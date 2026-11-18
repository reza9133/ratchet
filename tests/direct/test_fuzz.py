"""Randomized operation sequences with invariants checked after EVERY step.

Invariants (must hold whether the step succeeded or reverted):
  I1  money is conserved: balance == treasury + escrow + sum(claimable)
  I2  the pull-payment total equals the sum of individual balances
  I3  at most one motion is non-final and it owns the floor; escrow == its bond_left
  I4  roster size within 3..15 and equal to the member list; article count within 0..12
  I5  statuses only move along the allowed state machine and finals never change
  I6  counters agree with the motion records
  I7  a classified motion's tier is max(floor, tier of every touched article) and its
      vote counters never exceed the frozen roster
  I8  a reverted step changes nothing at all
"""
import json
import random

import pytest

from helpers import BOND, ConsensusFailed, FakeClerk

FINAL = {"ENACTED", "REJECTED", "LAPSED", "VOID", "WITHDRAWN", "EXPIRED"}
ALLOWED = {
    "FILED": {"FILED", "VOTING", "WITHDRAWN", "EXPIRED"},
    "VOTING": {"VOTING", "CONTESTABLE", "REJECTED", "LAPSED", "ENACTED", "VOID"},
    "CONTESTABLE": {"CONTESTABLE", "ENACTED", "REJECTED", "VOID"},
}
TEXTS = ["Meetings move to Saturdays.", "Spending rules in A3 are suspended.", "Anyone may admit new members at will.",
         "A digest is posted weekly.", "Quorum is lowered.", "Reword for clarity.", "Fund a poster for the A3 campaign."]


def is_user_error(exc):
    return type(exc).__name__ == "UserError"


class Driver:
    def __init__(self, world, seed):
        self.w = world
        self.rng = random.Random(seed)
        self.seen = set(world.hex)
        self.prev = {}
        self.ops = 0
        self.ok_ops = {}

    # ------------------------------------------------------------------ #
    def state_blob(self):
        a = self.w.view("get_assembly")
        count = json.loads(a)["motion_count"]
        ms = [self.w.view("get_motion", i) for i in range(1, count + 1)]
        c = self.w.view("get_charter")
        led = self.w.view("get_ledger")
        claims = [self.w.view("get_claimable", h) for h in sorted(self.seen)]
        return (a, tuple(ms), c, led, tuple(claims), self.w.contract_balance(), tuple(self.w.outbox))

    def attempt(self, who, method, *args, value=0):
        before = self.state_blob()
        try:
            self.w.call(who, method, *args, value=value)
            self.ok_ops[method] = self.ok_ops.get(method, 0) + 1
            return True
        except ConsensusFailed:
            pass
        except Exception as exc:
            if not is_user_error(exc):
                raise
        assert self.state_blob() == before, "a reverted call changed state: " + method   # I8
        return False

    # ------------------------------------------------------------------ #
    def random_clerk(self):
        ids = [a["id"] for a in json.loads(self.w.view("get_charter"))["articles"]]
        mode = self.rng.random()
        if mode < 0.15:
            return FakeClerk(fail="provider down")
        if mode < 0.25:
            return FakeClerk(malformed={"touches": {"ZZ": True}})
        force = {i: self.rng.random() < 0.25 for i in ids}
        return FakeClerk(force=force)

    def pick(self):
        return self.rng.choice(range(10))

    def step(self):
        w, rng = self.w, self.rng
        a = w.assembly()
        floor = a["floor_motion"]
        m = w.motion(floor) if floor else None
        roll = rng.random()
        self.ops += 1
        if roll < 0.07:
            w.advance(rng.choice([0, 1, 5, 20, 60, 119, 120, 121, 300]))
            return
        if roll < 0.12:
            self.attempt(self.pick(), "donate", value=rng.choice([0, 1, 10 ** 12, 10 ** 15, 3 * 10 ** 15]))
            return
        if roll < 0.18:
            self.attempt(self.pick(), "withdraw")
            return
        if roll < 0.86 and m is not None:                       # drive the motion on the floor
            self.drive(m)
            return
        if roll < 0.94 or m is None:
            self.file()
            return
        method = rng.choice(["classify", "vote", "close_vote", "finalize", "expire_motion",
                             "withdraw_motion", "challenge"])
        args = [rng.randint(0, a["motion_count"] + 1)]
        if method == "vote":
            args.append(rng.random() < 0.5)
        value = BOND if method == "challenge" and rng.random() < 0.7 else 0
        self.attempt(self.pick(), method, *args, value=value)

    def drive(self, m):
        w, rng = self.w, self.rng
        mid = m["id"]
        st = m["status"]
        member_idx = [i for i in range(10) if w.hex[i] in m["roster"]]

        def member():
            return rng.choice(member_idx) if member_idx and rng.random() < 0.92 else self.pick()

        if st == "FILED":
            act = rng.choice(["classify"] * 8 + ["withdraw", "expire"])
            if act == "classify":
                w.vm._live_llm_handler = self.random_clerk()
                w.validators = []
                self.attempt(member(), "classify", mid)
            elif act == "withdraw":
                self.attempt(self.pick(), "withdraw_motion", mid)
            else:
                w.advance(121)
                self.attempt(self.pick(), "expire_motion", mid)
        elif st == "VOTING":
            pending = [i for i in member_idx if w.view("get_vote", mid, w.hex[i]) == "NONE"]
            if pending and rng.random() < 0.88:
                self.attempt(rng.choice(pending), "vote", mid, rng.random() < 0.78)
            else:
                if rng.random() < 0.4:
                    w.advance(121)
                self.attempt(self.pick(), "close_vote", mid)
        elif st == "CONTESTABLE":
            act = rng.choice(["challenge", "challenge", "finalize", "wait"])
            if act == "challenge":
                w.vm._live_llm_handler = self.random_clerk()
                self.attempt(member(), "challenge", mid, value=rng.choice([BOND] * 9 + [1]))
            elif act == "finalize":
                if rng.random() < 0.5:
                    w.advance(121)
                self.attempt(self.pick(), "finalize", mid)
            else:
                w.advance(rng.choice([30, 121]))

    def file(self):
        w, rng = self.w, self.rng
        who = rng.choice(range(10))
        value = BOND if rng.random() < 0.9 else rng.choice([0, BOND + 1])
        kind = rng.choice(["amend", "amend", "grant", "admit", "expel"])
        ids = [x["id"] for x in json.loads(w.view("get_charter"))["articles"]]
        if kind == "amend":
            aid = rng.choice(ids + ["N%d" % rng.randint(0, 20)]) if ids else "N1"
            text = rng.choice(TEXTS + [""])
            tier = 0 if text == "" else rng.randint(1, 4)
            self.attempt(who, "file_amendment", aid, text, tier, value=value)
        elif kind == "grant":
            treasury = int(w.assembly()["treasury"])
            amount = rng.choice([1, max(1, treasury // 20), max(1, treasury // 3), treasury, treasury + 1])
            self.attempt(who, "file_grant", rng.choice(w.hex), amount, rng.choice(TEXTS), value=value)
        elif kind == "admit":
            cand = rng.choice(w.hex + ["0x" + "%040x" % rng.randint(1, 10 ** 9)])
            self.seen.add(cand)
            self.attempt(who, "file_admission", cand, rng.choice(TEXTS), value=value)
        else:
            self.attempt(who, "file_expulsion", rng.choice(w.hex), rng.choice(TEXTS), value=value)

    # ------------------------------------------------------------------ #
    def check(self):
        w = self.w
        a = w.assembly()
        led = w.ledger()
        n = a["motion_count"]
        motions = [w.motion(i) for i in range(1, n + 1)]
        # I1
        books = int(led["treasury"]) + int(led["escrow"]) + int(led["claimable_total"])
        assert int(led["balance"]) == books == int(led["books"]), led
        assert led["solvent"] is True
        # I2
        for m in motions:
            for h in (m["proposer"], m["detail"].get("recipient")):
                if h:
                    self.seen.add(h)
        total = sum(int(w.view("get_claimable", h)) for h in self.seen)
        assert total == int(led["claimable_total"]), (total, led)
        # I3
        active = [m for m in motions if m["status"] not in FINAL]
        assert len(active) <= 1
        assert a["floor_motion"] == (active[0]["id"] if active else 0)
        assert int(led["escrow"]) == (active[0]["bond_left"] if active else 0)
        for m in motions:
            if m["status"] in FINAL:
                assert m["bond_left"] == 0
        # I4
        assert 3 <= a["member_count"] <= 15 and a["member_count"] == len(a["members"]) == len(set(a["members"]))
        arts = json.loads(w.view("get_charter"))["articles"]
        assert a["article_count"] == len(arts) <= 12
        assert all(1 <= x["tier"] <= 4 for x in arts)
        # I5
        for m in motions:
            old = self.prev.get(m["id"])
            if old is not None:
                if old in FINAL:
                    assert m["status"] == old, (m["id"], old, m["status"])
                else:
                    assert m["status"] in ALLOWED[old], (m["id"], old, m["status"])
            self.prev[m["id"]] = m["status"]
        # I6
        stats = a["stats"]
        by = lambda s: sum(1 for m in motions if m["status"] == s)
        assert stats["filed"] == n
        assert stats["enacted"] == by("ENACTED") and stats["rejected"] == by("REJECTED")
        assert stats["lapsed"] == by("LAPSED") and stats["void"] == by("VOID")
        raised = sum(1 for m in motions if m["challenge"] and m["challenge"]["raised"])
        upheld = sum(1 for m in motions if m["challenge"] and not m["challenge"]["raised"])
        assert (stats["challenges_raised"], stats["challenges_upheld"]) == (raised, upheld)
        # I7
        for m in motions:
            assert m["yes"] + m["no"] <= len(m["roster"])
            if m["touches"] is not None:
                tiers = {x["id"]: x["tier"] for x in m["articles"]}
                expect = max([m["floor_tier"]] + [tiers[i] for i, f in m["touches"].items() if f])
                assert m["tier"] == expect, m
                assert m["challenge"] is None or m["challenge"]["tier_after"] == m["tier"]
            if m["challenge"] is not None:
                assert m["challenge"]["tier_after"] >= m["challenge"]["tier_before"]       # the ratchet


SEEDS = list(range(30))
COVERAGE = {}
SEEDS_RUN = set()


def record(world, driver, seed):
    for k, v in driver.ok_ops.items():
        COVERAGE["op:" + k] = COVERAGE.get("op:" + k, 0) + v
    n = world.assembly()["motion_count"]
    for i in range(1, n + 1):
        m = world.motion(i)
        for key in ("end:" + m["status"], "kind:%s:%s" % (m["kind"], m["status"])):
            COVERAGE[key] = COVERAGE.get(key, 0) + 1
        if m["challenge"]:
            key = "challenge:" + ("raised" if m["challenge"]["raised"] else "upheld")
            COVERAGE[key] = COVERAGE.get(key, 0) + 1
    SEEDS_RUN.add(seed)


@pytest.mark.parametrize("seed", SEEDS)
def test_random_operation_sequences_preserve_every_invariant(world, seed):
    d = Driver(world, seed)
    for _ in range(260):
        d.step()
        d.check()
    record(world, d, seed)


def test_fuzz_walks_actually_reach_every_branch():
    """Coverage guard: the random walks must have hit every ending, kind and the challenge game."""
    if len(SEEDS_RUN) < len(SEEDS):
        pytest.skip("run the whole module to evaluate fuzz coverage")
    required = [
        "end:ENACTED", "end:REJECTED", "end:LAPSED", "end:WITHDRAWN", "end:EXPIRED",
        "kind:AMEND:ENACTED", "kind:GRANT:ENACTED", "kind:ADMIT:ENACTED", "kind:EXPEL:ENACTED",
        "challenge:raised", "challenge:upheld",
        "op:classify", "op:vote", "op:close_vote", "op:finalize", "op:challenge", "op:withdraw",
        "op:donate", "op:expire_motion", "op:withdraw_motion",
        "op:file_amendment", "op:file_grant", "op:file_admission", "op:file_expulsion",
    ]
    missing = [k for k in required if COVERAGE.get(k, 0) == 0]
    assert not missing, (missing, dict(sorted(COVERAGE.items())))
