"""THE critical rule: exact equality between leader and validator.

Everything that is stored, counted, or decides the path or payout of a motion
(the per-article touch booleans, the tier derived from them, hence the vote
threshold, the bounty and the bond routing) must be reproduced by the validator
EXACTLY.  No tolerance, no adjacent-value acceptance.  Only the free-text
``reason`` may differ.
"""
import itertools

import pytest

from helpers import BOND, ConsensusFailed, FakeClerk
from flows import ballots, classify, file_adopt

IDS = ["A1", "A2", "A3", "A4"]           # tiers 1, 4, 3, 2
TIER = {"A1": 1, "A2": 4, "A3": 3, "A4": 2}
ALL_SUBSETS = [frozenset(c) for r in range(5) for c in itertools.combinations(IDS, r)]
_DEFAULT = object()


def clerk_for(subset, reason=None):
    clerk = FakeClerk(force={a: (a in subset) for a in IDS})
    return _ReasonClerk(clerk, reason) if reason is not None else clerk


class _ReasonClerk:
    def __init__(self, inner, reason):
        self.inner, self.reason, self.prompts = inner, reason, []

    def __call__(self, data):
        out = self.inner(data)
        self.prompts.append(data["prompt"])
        out["ok"]["reason"] = self.reason
        return out


def validator_vote(world, clerk, leader_result=_DEFAULT, leader_error=None):
    saved = world.vm._live_llm_handler
    world.vm._live_llm_handler = clerk
    try:
        if leader_error is not None:
            return world.vm.run_validator(leader_error=leader_error)
        if leader_result is not _DEFAULT:
            return world.vm.run_validator(leader_result=leader_result)
        return world.vm.run_validator()
    finally:
        world.vm._live_llm_handler = saved


def classify_with(world, mid, leader_subset):
    world.vm._live_llm_handler = clerk_for(leader_subset)
    world.call(2, "classify", mid)


def derived(subset, floor=1):
    return max([floor] + [TIER[a] for a in subset])


# --------------------------------------------------------------------------- #
def test_every_pair_of_assessments_agrees_only_when_identical(world):
    """16 x 16 leader/validator combinations: agreement iff the boolean maps are equal.

    This includes pairs whose derived tier is the same (e.g. {A2} vs {A2, A4}: both 4)
    and pairs whose tiers are adjacent: neither is tolerated.
    """
    mid = file_adopt(world)
    for leader in ALL_SUBSETS:
        snap = world.vm.snapshot()
        classify_with(world, mid, leader)
        for validator in ALL_SUBSETS:
            vote = validator_vote(world, clerk_for(validator))
            assert vote is (leader == validator), (sorted(leader), sorted(validator))
        world.vm.revert(snap)


def test_adjacent_tier_difference_is_rejected_both_directions(world):
    mid = file_adopt(world)
    for lo, hi in ((frozenset(), frozenset({"A4"})), (frozenset({"A4"}), frozenset({"A3"})),
                   (frozenset({"A3"}), frozenset({"A2"}))):
        assert abs(derived(lo) - derived(hi)) == 1
        for leader, validator in ((lo, hi), (hi, lo)):
            snap = world.vm.snapshot()
            classify_with(world, mid, leader)
            assert validator_vote(world, clerk_for(validator)) is False
            world.vm.revert(snap)


def test_same_tier_but_different_booleans_is_still_rejected(world):
    mid = file_adopt(world)
    classify_with(world, mid, frozenset({"A2"}))                   # tier 4
    assert derived({"A2"}) == derived({"A2", "A4"}) == 4
    assert validator_vote(world, clerk_for(frozenset({"A2", "A4"}))) is False
    assert validator_vote(world, clerk_for(frozenset({"A2"}))) is True


def test_free_text_reason_is_the_only_thing_allowed_to_differ(world):
    mid = file_adopt(world)
    classify_with(world, mid, frozenset({"A3"}))
    assert validator_vote(world, _ReasonClerk(clerk_for(frozenset({"A3"})), "Entirely different wording.")) is True
    assert validator_vote(world, _ReasonClerk(clerk_for(frozenset({"A3"})), "")) is True
    assert validator_vote(world, _ReasonClerk(clerk_for(frozenset({"A3"})), 12345)) is True


def test_validator_assesses_independently_and_never_sees_the_leader_answer(world):
    mid = file_adopt(world)
    classify_with(world, mid, frozenset({"A3"}))
    spy = clerk_for(frozenset({"A3"}))
    validator_vote(world, spy)
    assert len(spy.prompts) == 1
    prompt = spy.prompts[0]
    assert "LEADER" not in prompt.upper().replace("EVIDENCE_JSON", "") or "leader" not in prompt.lower()
    assert '"touches"' in prompt                       # only the output schema is shown
    assert "Clerk reasoning for the record." not in prompt


def test_leader_error_is_never_approved(world):
    mid = file_adopt(world)
    classify_with(world, mid, frozenset())
    assert validator_vote(world, clerk_for(frozenset()), leader_error=Exception("[LLM_ERROR] boom")) is False


@pytest.mark.parametrize("forge", [
    lambda t: {**t, "tier": t["tier"] + 1},                       # forged tier
    lambda t: {**t, "tier": 1},                                   # forged lower tier
    lambda t: {**t, "tier": True},                                # bool is not an int tier
    lambda t: {**t, "tier": float(t["tier"])},                    # float tier
    lambda t: {**t, "extra": 1},                                  # smuggled field
    lambda t: {"touches": t["touches"], "tier": t["tier"]},       # missing reason
    lambda t: {**t, "reason": None},                              # non-string reason
    lambda t: {**t, "touches": {"A1": False}},                    # missing articles
    lambda t: {**t, "touches": {**t["touches"], "A9": True}},     # invented article
    lambda t: {**t, "touches": {k: int(v) for k, v in t["touches"].items()}},   # ints, not bools
    lambda t: {**t, "touches": {k: str(v).lower() for k, v in t["touches"].items()}},  # "true"/"false"
    lambda t: "free text",                                        # not even a mapping
    lambda t: None,
    lambda t: [],
])
def test_forged_or_malformed_leader_results_are_rejected(world, forge):
    mid = file_adopt(world)
    classify_with(world, mid, frozenset({"A3"}))
    honest = {"touches": {a: a == "A3" for a in IDS}, "tier": 3, "reason": "ok"}
    # sanity: the honest object is accepted by an independent, identical validator
    assert validator_vote(world, clerk_for(frozenset({"A3"})), leader_result=honest) is True
    assert validator_vote(world, clerk_for(frozenset({"A3"})), leader_result=forge(honest)) is False


def test_forged_leader_tier_cannot_ride_on_equal_booleans(world):
    mid = file_adopt(world)
    classify_with(world, mid, frozenset({"A3"}))
    forged = {"touches": {"A1": False, "A2": False, "A3": True, "A4": False}, "tier": 4, "reason": "x"}
    assert validator_vote(world, clerk_for(frozenset({"A3"})), leader_result=forged) is False


def test_validator_side_failures_vote_disagree_not_crash(world):
    mid = file_adopt(world)
    classify_with(world, mid, frozenset())
    for bad in (FakeClerk(fail="provider down"),
                FakeClerk(malformed={"touches": {"A1": True}}),
                FakeClerk(malformed="not json"),
                FakeClerk(malformed={"touches": {a: "false" for a in IDS}})):
        assert validator_vote(world, bad) is False


# --------------------------------------------------------------------------- #
# transaction-level behaviour (leader + N validators, majority decides)
# --------------------------------------------------------------------------- #
def test_unanimous_validators_commit(world):
    mid = file_adopt(world)
    world.validators = [FakeClerk() for _ in range(4)]
    assert classify(world, mid)["status"] == "VOTING"


@pytest.mark.parametrize("article", IDS)
def test_all_validators_disagreeing_on_any_single_article_rolls_back(world, article):
    mid = file_adopt(world)
    before = world.view("get_motion", mid)
    world.validators = [FakeClerk(flip=[article]) for _ in range(4)]
    with pytest.raises(ConsensusFailed):
        world.call(2, "classify", mid)
    assert world.view("get_motion", mid) == before and world.motion(mid)["status"] == "FILED"


def test_majority_rule_with_one_dissenter_still_commits_but_dissenter_voted_no(world):
    mid = file_adopt(world)
    dissenter = FakeClerk(flip=["A4"])
    world.validators = [FakeClerk(), FakeClerk(), FakeClerk(), dissenter]
    assert classify(world, mid)["status"] == "VOTING"
    assert validator_vote(world, dissenter) is False


def test_three_of_four_validators_dissenting_rolls_back(world):
    mid = file_adopt(world)
    world.validators = [FakeClerk(), FakeClerk(flip=["A3"]), FakeClerk(flip=["A3"]), FakeClerk(flip=["A1"])]
    with pytest.raises(ConsensusFailed):
        world.call(2, "classify", mid)
    assert world.motion(mid)["status"] == "FILED"


def test_challenge_path_uses_the_same_exact_rule(world):
    mid = file_adopt(world)
    classify(world, mid)
    ballots(world, mid, yes=[0, 1, 2], no=[3, 4])
    world.call(3, "close_vote", mid)
    assert world.motion(mid)["status"] == "CONTESTABLE"
    world.vm._live_llm_handler = FakeClerk(force={"A2": True, "A1": False, "A3": False, "A4": False})
    for flip in IDS:
        world.validators = [FakeClerk(force={"A2": True, "A1": False, "A3": False, "A4": False}, flip=[flip])
                            for _ in range(4)]
        before = world.view("get_motion", mid)
        with pytest.raises(ConsensusFailed):
            world.call(3, "challenge", mid, value=BOND)
        assert world.view("get_motion", mid) == before
        world.check_conservation()
    # nothing was paid for a failed consensus
    assert world.contract_balance() == BOND
