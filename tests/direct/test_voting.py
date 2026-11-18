"""Voting window, closing rules (including the no-early-pass rule), lapse and expiry."""
import pytest

from helpers import BOND
from flows import ballots, classify, file_adopt, open_vote


def test_vote_requires_open_voting(world):
    mid = file_adopt(world)
    with pytest.raises(Exception, match="voting is not open"):
        world.call(1, "vote", mid, True)
    with pytest.raises(Exception, match="motion not found"):
        world.call(1, "vote", 42, True)


def test_vote_rules(world):
    mid = open_vote(world)
    with pytest.raises(Exception, match="not on the frozen roster"):
        world.call(7, "vote", mid, True)
    with pytest.raises(Exception, match="support must be a boolean"):
        world.call(1, "vote", mid, 1)
    world.call(1, "vote", mid, True)
    with pytest.raises(Exception, match="already voted"):
        world.call(1, "vote", mid, False)
    m = world.motion(mid)
    assert (m["yes"], m["no"]) == (1, 0)
    assert world.view("get_vote", mid, world.hex[1]) == "YES"
    assert world.view("get_vote", mid, world.hex[2]) == "NONE"
    world.call(2, "vote", mid, False)
    assert world.view("get_vote", mid, world.hex[2]) == "NO"
    m = world.motion(mid)
    assert (m["yes"], m["no"]) == (1, 1)


def test_vote_deadline_is_exclusive_and_close_is_inclusive(world):
    mid = open_vote(world)
    world.advance(119)
    world.call(1, "vote", mid, True)
    world.advance(1)                                          # exactly at the deadline
    with pytest.raises(Exception, match="deadline passed"):
        world.call(2, "vote", mid, True)
    world.call(3, "close_vote", mid)                          # closing is allowed from that second
    assert world.motion(mid)["status"] == "LAPSED"            # 1 of 5 voted


def test_close_too_early_is_refused(world):
    mid = open_vote(world)
    ballots(world, mid, yes=[0, 1])
    with pytest.raises(Exception, match="voting is still open"):
        world.call(3, "close_vote", mid)


def test_no_early_pass_even_when_threshold_is_met(world):
    """A passing count must not end the vote while members who could still vote exist."""
    mid = open_vote(world)
    ballots(world, mid, yes=[0, 1, 2])                        # tier 1 needs 3 of 5
    with pytest.raises(Exception, match="voting is still open"):
        world.call(3, "close_vote", mid)
    world.advance(120)
    world.call(3, "close_vote", mid)
    assert world.motion(mid)["status"] == "CONTESTABLE"


def test_close_when_everyone_voted(world):
    mid = open_vote(world)
    ballots(world, mid, yes=[0, 1, 2, 3], no=[4])
    world.call(3, "close_vote", mid)
    m = world.motion(mid)
    assert m["status"] == "CONTESTABLE" and m["provisional"] == "PASSED"
    assert m["contest_deadline"] == m["closed_at"] + 120


def test_hopeless_motion_rejects_early_when_half_the_roster_voted(world):
    mid = open_vote(world)                                    # tier 1, needs 3
    ballots(world, mid, no=[0, 1, 2])                         # 0 yes + 2 left < 3
    world.call(4, "close_vote", mid)
    m = world.motion(mid)
    assert m["status"] == "REJECTED"
    assert world.assembly()["floor_motion"] == 0
    assert world.view("get_claimable", world.hex[1]) == str(BOND)       # bond returned
    assert world.assembly()["stats"]["rejected"] == 1
    world.check_conservation()


def test_hopeless_with_low_participation_must_wait_and_then_lapses(world):
    world.call(1, "file_amendment", "A2", "Membership is open to all.", 4, value=BOND)
    classify(world, 1)                                        # tier 4 -> unanimity needed
    ballots(world, 1, no=[0, 1])                              # hopeless but only 2 of 5 voted
    with pytest.raises(Exception, match="voting is still open"):
        world.call(4, "close_vote", 1)
    world.advance(120)
    world.call(4, "close_vote", 1)
    m = world.motion(1)
    assert m["status"] == "LAPSED" and m["bond_left"] == 0
    assert world.assembly()["treasury"] == str(BOND)          # forfeited to the commons
    assert world.view("get_claimable", world.hex[1]) == "0"
    assert world.assembly()["stats"]["lapsed"] == 1 and world.assembly()["floor_motion"] == 0
    world.check_conservation()


def test_lapse_when_nobody_votes(world):
    mid = open_vote(world)
    world.advance(121)
    world.call(0, "close_vote", mid)
    assert world.motion(mid)["status"] == "LAPSED"
    assert world.assembly()["treasury"] == str(BOND)
    world.check_conservation()


def test_exactly_half_participation_is_not_a_lapse(world):
    """participation * 2 >= roster: with 4 members, 2 voters are enough to avoid a lapse."""
    founders = None
    mid = open_vote(world)
    ballots(world, mid, no=[0, 1, 2])                         # 3 of 5 voted (>= half): rejected, not lapsed
    world.advance(120)
    world.call(0, "close_vote", mid)
    assert world.motion(mid)["status"] == "REJECTED"


def test_rejected_after_deadline_with_enough_participation(world):
    mid = open_vote(world)
    ballots(world, mid, yes=[0, 1], no=[2])                   # 3 voted, only 2 yes (needs 3)
    world.advance(120)
    world.call(0, "close_vote", mid)
    assert world.motion(mid)["status"] == "REJECTED"
    assert world.view("get_claimable", world.hex[1]) == str(BOND)


def test_close_vote_is_permissionless_and_single_shot(world):
    mid = open_vote(world)
    ballots(world, mid, no=[0, 1, 2])
    world.call(9, "close_vote", mid)                          # a non-member may close
    with pytest.raises(Exception, match="voting is not open"):
        world.call(9, "close_vote", mid)
    with pytest.raises(Exception, match="voting is not open"):
        world.call(1, "vote", mid, True)


def test_floor_is_free_again_after_every_ending(world):
    mid = open_vote(world)
    world.advance(121)
    world.call(0, "close_vote", mid)
    assert world.assembly()["floor_motion"] == 0
    mid2 = file_adopt(world, who=2, aid="NEWS2")
    assert mid2 == 2 and world.assembly()["floor_motion"] == 2


# --------------------------------------------------------------------------- #
# expiry and withdrawal of unclassified motions
# --------------------------------------------------------------------------- #
def test_expire_motion_after_stale_window(world):
    mid = file_adopt(world)
    with pytest.raises(Exception, match="not stale yet"):
        world.call(9, "expire_motion", mid)
    world.advance(120)
    world.call(9, "expire_motion", mid)                       # anyone may expire
    m = world.motion(mid)
    assert m["status"] == "EXPIRED" and m["bond_left"] == 0
    assert world.view("get_claimable", world.hex[1]) == str(BOND)
    assert world.assembly()["floor_motion"] == 0
    with pytest.raises(Exception, match="not waiting for classification"):
        world.call(9, "expire_motion", mid)
    world.check_conservation()


def test_withdraw_motion_rules(world):
    mid = file_adopt(world)
    with pytest.raises(Exception, match="only the proposer"):
        world.call(2, "withdraw_motion", mid)
    world.call(1, "withdraw_motion", mid)
    assert world.motion(mid)["status"] == "WITHDRAWN"
    assert world.view("get_claimable", world.hex[1]) == str(BOND)
    mid2 = open_vote(world, who=1, aid="NEWS2")
    with pytest.raises(Exception, match="only an unclassified motion"):
        world.call(1, "withdraw_motion", mid2)
    with pytest.raises(Exception, match="not waiting for classification"):
        world.call(9, "expire_motion", mid2)


def test_classified_motion_cannot_expire(world):
    mid = open_vote(world)
    world.advance(10_000)
    with pytest.raises(Exception, match="not waiting for classification"):
        world.call(9, "expire_motion", mid)


def test_each_window_uses_its_own_parameter(direct_vm, direct_deploy, direct_accounts):
    """vote window 5 min, challenge window 3 min: no parameter may be mixed up."""
    import json
    from helpers import CHARTER, World
    args = ("Windows", ["0x" + bytes(a).hex() for a in direct_accounts[:5]], json.dumps(CHARTER), BOND, 5, 3)
    w = World(direct_vm, direct_deploy, direct_accounts, deploy_args=args)
    w.call(1, "file_amendment", "NEWS", "A digest.", 1, value=BOND)
    m = w.motion(1)
    assert m["stale_at"] - m["filed_at"] == 300
    w.advance(299)
    with pytest.raises(Exception, match="not stale yet"):
        w.call(9, "expire_motion", 1)
    m = classify(w, 1)
    assert m["vote_deadline"] - m["classified_at"] == 300
    ballots(w, 1, yes=[0, 1, 2, 3, 4])
    w.call(3, "close_vote", 1)
    m = w.motion(1)
    assert m["contest_deadline"] - m["closed_at"] == 180
    w.advance(179)
    with pytest.raises(Exception, match="contest window still open"):
        w.call(0, "finalize", 1)
    w.advance(2)
    w.call(0, "finalize", 1)
    assert w.motion(1)["status"] == "ENACTED"


def test_even_roster_half_participation_is_rejection_not_lapse(direct_vm, direct_deploy, direct_accounts):
    """4 members, 2 vote: exactly half took part, so the motion is rejected and the bond is returned."""
    import json
    from helpers import CHARTER, World
    args = ("Four", ["0x" + bytes(a).hex() for a in direct_accounts[:4]], json.dumps(CHARTER), BOND, 2, 2)
    w = World(direct_vm, direct_deploy, direct_accounts, deploy_args=args)
    w.call(1, "file_amendment", "NEWS", "A digest.", 1, value=BOND)
    classify(w, 1)
    ballots(w, 1, no=[0, 1])                                  # tier 1 needs 3: hopeless; 2*2 >= 4 -> may close now
    w.call(3, "close_vote", 1)
    assert w.motion(1)["status"] == "REJECTED"
    assert w.view("get_claimable", w.hex[1]) == str(BOND) and w.assembly()["treasury"] == "0"
