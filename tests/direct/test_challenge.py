"""The ratchet: challenges raise tiers (never lower them) and route bonds exactly."""
import json

import pytest

from helpers import BOND, FakeClerk
from flows import ballots, classify, file_adopt

STEALTH = "Any single officer may admit new members at will."
STEALTH_CLERK = {"A2": ["admit new members"]}
HALF = BOND // 2


def stealth_contestable(world, yes=(0, 1, 2), no=(3, 4)):
    """A tier-1 motion that passes provisionally but implicitly overrides entrenched A2."""
    world.clerk.implicit = dict(STEALTH_CLERK)
    mid = file_adopt(world, who=1, aid="OFFICER", text=STEALTH, tier=1)
    classify(world, mid)
    assert world.motion(mid)["tier"] == 1                     # strict reading misses it
    ballots(world, mid, yes=yes, no=no)
    world.call(3, "close_vote", mid)
    assert world.motion(mid)["status"] == "CONTESTABLE"
    return mid


def test_raised_challenge_pays_bounty_and_rejects_under_the_new_threshold(world):
    mid = stealth_contestable(world)
    world.call(3, "challenge", mid, value=BOND)
    m = world.motion(mid)
    assert m["challenge"]["raised"] is True and m["challenge"]["by"] == world.hex[3]
    assert (m["challenge"]["tier_before"], m["challenge"]["tier_after"]) == (1, 4)
    assert m["touches"]["A2"] is True and m["tier"] == 4 and m["votes_needed"] == 5
    assert m["bond_left"] == BOND - HALF
    assert world.view("get_claimable", world.hex[3]) == str(BOND + HALF)      # own bond back + bounty
    ledger = world.ledger()
    assert ledger["escrow"] == str(BOND - HALF) and ledger["treasury"] == "0"
    world.check_conservation()
    world.call(9, "finalize", mid)                                            # immediate after a challenge
    m = world.motion(mid)
    assert m["status"] == "REJECTED"                                          # 3 yes < 5 needed
    assert world.view("get_claimable", world.hex[1]) == str(BOND - HALF)
    assert world.assembly()["article_count"] == 4 and world.assembly()["floor_motion"] == 0
    stats = world.assembly()["stats"]
    assert (stats["challenges_raised"], stats["challenges_upheld"], stats["rejected"]) == (1, 0, 1)
    assert json.loads(world.view("get_standing", world.hex[3]))["raised"] == 1
    world.check_conservation()


def test_failed_challenge_compensates_proposer_and_funds_the_commons(world):
    mid = stealth_contestable(world)
    world.clerk.implicit = {}                                                 # inclusive reading finds nothing
    world.call(3, "challenge", mid, value=BOND)
    m = world.motion(mid)
    assert m["challenge"]["raised"] is False and m["tier"] == 1
    assert world.view("get_claimable", world.hex[1]) == str(HALF)             # compensation
    assert world.assembly()["treasury"] == str(BOND - HALF)
    assert world.view("get_claimable", world.hex[3]) == "0"                   # challenger loses the bond
    world.check_conservation()
    world.call(9, "finalize", mid)
    assert world.motion(mid)["status"] == "ENACTED"
    assert world.view("get_claimable", world.hex[1]) == str(HALF + BOND)
    assert world.assembly()["article_count"] == 5
    stats = world.assembly()["stats"]
    assert (stats["challenges_raised"], stats["challenges_upheld"], stats["enacted"]) == (0, 1, 1)
    assert json.loads(world.view("get_standing", world.hex[3]))["lost"] == 1
    world.check_conservation()


def test_raised_challenge_can_still_pass_if_the_assembly_agrees(world):
    mid = stealth_contestable(world, yes=(0, 1, 2, 3, 4), no=())
    world.call(3, "challenge", mid, value=BOND)
    assert world.motion(mid)["tier"] == 4
    world.call(9, "finalize", mid)
    assert world.motion(mid)["status"] == "ENACTED"                           # unanimity reached
    assert world.view("get_claimable", world.hex[3]) == str(BOND + HALF)
    assert world.view("get_claimable", world.hex[1]) == str(BOND - HALF)
    world.check_conservation()


def test_the_ratchet_never_turns_down(world):
    """Strict reading touched A3; an inclusive re-read that no longer flags it cannot lower the tier."""
    world.call(1, "file_amendment", "NEWS", "Newsletter rules. Spending rules in A3 are suspended.", 1, value=BOND)
    classify(world, 1)
    assert world.motion(1)["tier"] == 3 and world.motion(1)["touches"]["A3"] is True
    ballots(world, 1, yes=[0, 1, 2, 3], no=[4])
    world.call(3, "close_vote", 1)
    world.vm._live_llm_handler = FakeClerk(force={"A1": False, "A2": False, "A3": False, "A4": False})
    world.call(3, "challenge", 1, value=BOND)
    m = world.motion(1)
    assert m["touches"]["A3"] is True and m["tier"] == 3
    assert m["challenge"]["raised"] is False and m["challenge"]["touches"]["A3"] is False
    assert m["challenge"]["tier_after"] == 3


def test_challenge_uses_the_inclusive_reading_and_the_same_frozen_evidence(world):
    mid = stealth_contestable(world)
    strict_prompt = world.clerk.prompts[-1]
    world.call(3, "challenge", mid, value=BOND)
    inclusive_prompt = world.clerk.prompts[-1]
    assert "READING: STRICT" in strict_prompt and "READING: INCLUSIVE" in inclusive_prompt
    assert strict_prompt.split("EVIDENCE_JSON=")[1] == inclusive_prompt.split("EVIDENCE_JSON=")[1]


def test_challenge_window_and_state_rules(world):
    world.clerk.implicit = dict(STEALTH_CLERK)
    mid = file_adopt(world, who=1, aid="OFFICER", text=STEALTH)
    with pytest.raises(Exception, match="not contestable"):
        world.call(3, "challenge", mid, value=BOND)                           # still FILED
    classify(world, mid)
    with pytest.raises(Exception, match="not contestable"):
        world.call(3, "challenge", mid, value=BOND)                           # still VOTING
    ballots(world, mid, yes=[0, 1, 2], no=[3, 4])
    world.call(3, "close_vote", mid)
    with pytest.raises(Exception, match="proposer cannot challenge"):
        world.call(1, "challenge", mid, value=BOND)
    with pytest.raises(Exception, match="members only"):
        world.call(8, "challenge", mid, value=BOND)
    for wrong in (0, BOND - 1, BOND + 1):
        with pytest.raises(Exception, match="attach exactly the bond"):
            world.call(3, "challenge", mid, value=wrong)
    world.call(3, "challenge", mid, value=BOND)
    with pytest.raises(Exception, match="already challenged"):
        world.call(4, "challenge", mid, value=BOND)
    world.check_conservation()


def test_challenge_window_closes(world):
    mid = stealth_contestable(world)
    world.advance(120)                                                        # exactly the deadline: still open
    world.call(3, "challenge", mid, value=BOND)
    mid2 = None
    assert world.motion(mid)["challenge"] is not None


def test_challenge_after_window_is_refused_and_finalize_opens(world):
    mid = stealth_contestable(world)
    world.advance(121)
    with pytest.raises(Exception, match="contest window closed"):
        world.call(3, "challenge", mid, value=BOND)
    assert world.contract_balance() == BOND                                   # the refused bond went nowhere
    world.call(0, "finalize", mid)
    assert world.motion(mid)["status"] == "ENACTED"                           # the stealth motion slipped through


def test_finalize_rules(world):
    mid = stealth_contestable(world)
    with pytest.raises(Exception, match="contest window still open"):
        world.call(0, "finalize", mid)
    world.advance(120)
    with pytest.raises(Exception, match="contest window still open"):
        world.call(0, "finalize", mid)
    world.advance(1)
    world.call(0, "finalize", mid)
    with pytest.raises(Exception, match="not contestable"):
        world.call(0, "finalize", mid)


def test_unchallengeable_when_no_other_article_exists(direct_vm, direct_deploy, direct_accounts):
    import json as _json
    from helpers import World
    args = ("Solo", ["0x" + bytes(a).hex() for a in direct_accounts[:5]],
            _json.dumps([{"id": "ONLY", "text": "The only article.", "tier": 2}]), BOND, 2, 2)
    w = World(direct_vm, direct_deploy, direct_accounts, deploy_args=args)
    w.call(1, "file_amendment", "ONLY", "The only article, reworded.", 2, value=BOND)
    m = classify(w, 1)
    assert m["touches"] == {} and m["tier"] == 2 and w.clerk.prompts == []    # deterministic, no LLM call
    ballots(w, 1, yes=[0, 1, 2, 3], no=[4])
    w.call(3, "close_vote", 1)
    assert w.motion(1)["status"] == "ENACTED"                                 # no contest phase at all
    w.check_conservation()


def test_unchallengeable_direct_call_guard(direct_vm, direct_deploy, direct_accounts):
    import json as _json
    from helpers import World
    args = ("Solo", ["0x" + bytes(a).hex() for a in direct_accounts[:5]],
            _json.dumps([{"id": "ONLY", "text": "The only article.", "tier": 2}]), BOND, 2, 2)
    w = World(direct_vm, direct_deploy, direct_accounts, deploy_args=args)
    w.call(1, "file_amendment", "ONLY", "The only article, reworded.", 2, value=BOND)
    classify(w, 1)
    ballots(w, 1, yes=[0, 1, 2, 3], no=[4])
    # force the (unreachable) CONTESTABLE state to prove the guard in `challenge` itself
    raw = json.loads(w.contract.motions[1])
    raw["status"] = "CONTESTABLE"
    raw["contest_deadline"] = 10 ** 12
    w.contract.motions[1] = json.dumps(raw)
    with pytest.raises(Exception, match="nothing to contest"):
        w.call(3, "challenge", 1, value=BOND)
