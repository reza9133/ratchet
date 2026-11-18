"""Enactment of every motion kind, per-tier thresholds, withdrawals, defensive VOID paths, views."""
import json

import pytest

from helpers import BOND, CHARTER, World
from flows import ballots, classify, file_adopt


def pass_all(world, mid, yes=(0, 1, 2, 3, 4), no=()):
    classify(world, mid)
    ballots(world, mid, yes=yes, no=no)
    world.call(3, "close_vote", mid)
    m = world.motion(mid)
    if m["status"] == "CONTESTABLE":
        world.advance(121)
        world.call(4, "finalize", mid)
    return world.motion(mid)


def charter(world):
    return {a["id"]: a for a in json.loads(world.view("get_charter"))["articles"]}


# --------------------------------------------------------------------------- #
# per-tier thresholds on a 9-member roster, where all four tiers differ
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("aid,tier,need", [("A1", 1, 5), ("A4", 2, 6), ("A3", 3, 8), ("A2", 4, 9)])
@pytest.mark.parametrize("delta,expected", [(-1, "REJECTED"), (0, "ENACTED")])
def test_threshold_per_tier(direct_vm, direct_deploy, direct_accounts, aid, tier, need, delta, expected):
    founders = ["0x" + bytes(a).hex() for a in direct_accounts[:9]]
    args = ("Nine", founders, json.dumps(CHARTER), BOND, 2, 2)
    w = World(direct_vm, direct_deploy, direct_accounts, deploy_args=args)
    w.call(1, "file_amendment", aid, "Reworded for the test.", tier, value=BOND)
    classify(w, 1)
    assert w.motion(1)["tier"] == tier and w.motion(1)["votes_needed"] == need
    yes = need + delta
    for i in range(9):
        w.call(i, "vote", 1, i < yes)
    w.call(0, "close_vote", 1)
    if w.motion(1)["status"] == "CONTESTABLE":
        w.advance(121)
        w.call(0, "finalize", 1)
    assert w.motion(1)["status"] == expected, (aid, yes, need)
    w.check_conservation()


# --------------------------------------------------------------------------- #
# effects of enacted motions
# --------------------------------------------------------------------------- #
def test_adopt_replace_repeal_update_the_charter(world):
    mid = file_adopt(world, aid="NEWS", text="A weekly digest is posted.", tier=2)
    assert pass_all(world, mid)["status"] == "ENACTED"
    assert charter(world)["NEWS"] == {"id": "NEWS", "text": "A weekly digest is posted.", "tier": 2}
    assert json.loads(world.view("get_charter"))["version"] == 2
    world.call(2, "file_amendment", "NEWS", "A digest is posted every Friday.", 3, value=BOND)
    assert pass_all(world, 2)["status"] == "ENACTED"
    assert charter(world)["NEWS"]["tier"] == 3 and "Friday" in charter(world)["NEWS"]["text"]
    world.call(2, "file_amendment", "NEWS", "", 0, value=BOND)
    assert world.motion(3)["floor_tier"] == 3
    m = pass_all(world, 3, yes=(0, 1, 2, 3), no=(4,))
    assert m["status"] == "ENACTED" and "NEWS" not in charter(world)
    assert world.assembly()["article_count"] == 4
    assert json.loads(world.view("get_charter"))["version"] == 4
    world.check_conservation()


def test_grant_moves_treasury_to_recipient_and_withdraw_pays(world):
    world.call(2, "donate", value=10 ** 16)
    world.call(1, "file_grant", world.hex[6], 10 ** 15, "Hall rental for the spring meeting.", value=BOND)
    assert world.motion(1)["floor_tier"] == 1
    assert pass_all(world, 1)["status"] == "ENACTED"
    assert world.assembly()["treasury"] == str(9 * 10 ** 15)
    assert world.view("get_claimable", world.hex[6]) == str(10 ** 15)
    world.check_conservation()
    before = world.balance(6)
    world.call(6, "withdraw")
    assert world.outbox[-1] == (world.hex[6], 10 ** 15) and world.balance(6) == before + 10 ** 15
    assert world.view("get_claimable", world.hex[6]) == "0"
    with pytest.raises(Exception, match="nothing to withdraw"):
        world.call(6, "withdraw")
    world.check_conservation()


def test_large_grants_need_larger_majorities(world):
    world.call(2, "donate", value=10 ** 16)
    world.call(1, "file_grant", world.hex[6], 6 * 10 ** 15, "Most of the treasury for a new roof.", value=BOND)
    m = classify(world, 1)
    assert m["floor_tier"] == 3 and m["tier"] == 3 and m["votes_needed"] == 4
    ballots(world, 1, yes=[0, 1, 2], no=[3, 4])
    world.call(3, "close_vote", 1)
    assert world.motion(1)["status"] == "REJECTED"
    assert world.assembly()["treasury"] == str(10 ** 16)                       # untouched


def test_grant_that_contradicts_an_entrenched_article_climbs_the_ladder(world):
    world.call(2, "donate", value=10 ** 16)
    world.call(1, "file_grant", world.hex[6], 10 ** 14, "Fund the A3 campaign poster printing.", value=BOND)
    m = classify(world, 1)
    assert m["floor_tier"] == 1 and m["touches"]["A3"] is True and m["tier"] == 3


def test_admission_adds_a_voter_for_the_next_motion(world):
    world.call(1, "file_admission", world.hex[8], "Longtime volunteer.", value=BOND)
    m = pass_all(world, 1, yes=(0, 1, 2, 3), no=(4,))
    assert m["status"] == "ENACTED" and m["floor_tier"] == 2
    assert world.assembly()["member_count"] == 6 and world.hex[8] in world.assembly()["members"]
    mid = file_adopt(world, who=8, aid="HELLO", text="A greeting article.")
    assert world.motion(mid)["roster"] == sorted(world.hex[:5] + [world.hex[8]])
    classify(world, mid)
    world.call(8, "vote", mid, True)


def test_expulsion_removes_a_voter(world):
    world.call(1, "file_expulsion", world.hex[4], "Repeated absence.", value=BOND)
    m = pass_all(world, 1, yes=(0, 1, 2, 3), no=(4,))
    assert m["status"] == "ENACTED" and m["floor_tier"] == 3
    assert world.assembly()["member_count"] == 4 and world.hex[4] not in world.assembly()["members"]
    with pytest.raises(Exception, match="members only"):
        world.call(4, "file_amendment", "X", "text", 1, value=BOND)
    mid = file_adopt(world)
    classify(world, mid)
    with pytest.raises(Exception, match="not on the frozen roster"):
        world.call(4, "vote", mid, True)


def test_rejected_motion_has_no_effect_and_returns_the_bond(world):
    mid = file_adopt(world)
    pass_all(world, mid, yes=(0,), no=(1, 2, 3, 4))
    assert world.motion(mid)["status"] == "REJECTED" and world.assembly()["article_count"] == 4
    assert world.view("get_claimable", world.hex[1]) == str(BOND)
    assert world.ledger()["escrow"] == "0"


def test_counters_and_standing(world):
    pass_all(world, file_adopt(world))                                         # enacted
    pass_all(world, file_adopt(world, aid="TWO"), yes=(0,), no=(1, 2, 3, 4))   # rejected
    stats = world.assembly()["stats"]
    assert (stats["filed"], stats["enacted"], stats["rejected"]) == (2, 1, 1)
    assert json.loads(world.view("get_standing", world.hex[1])) == {"filed": 2, "enacted": 1, "raised": 0, "lost": 0}


def test_list_motions_pagination_and_bounds(world):
    for i in range(4):
        world.call(1, "file_amendment", "N%d" % i, "text %d" % i, 1, value=BOND)
        world.call(1, "withdraw_motion", i + 1)
    page = json.loads(world.view("list_motions", 0, 3))
    assert page["total"] == 4 and [m["id"] for m in page["motions"]] == [1, 2, 3]
    page = json.loads(world.view("list_motions", 3, 3))
    assert [m["id"] for m in page["motions"]] == [4] and page["motions"][0]["status"] == "WITHDRAWN"
    assert json.loads(world.view("list_motions", 10, 5))["motions"] == []
    for offset, limit in ((-1, 5), (0, 0), (0, 21)):
        with pytest.raises(Exception, match="offset >= 0"):
            world.view("list_motions", offset, limit)


def test_views_reject_bad_input(world):
    with pytest.raises(Exception, match="motion not found"):
        world.view("get_motion", 0)
    with pytest.raises(Exception, match="invalid address"):
        world.view("get_claimable", "0x1234")
    with pytest.raises(Exception, match="motion not found"):
        world.view("get_vote", 5, world.hex[1])


# --------------------------------------------------------------------------- #
# money
# --------------------------------------------------------------------------- #
def test_donate_rules(world):
    with pytest.raises(Exception, match="positive amount"):
        world.call(2, "donate", value=0)
    world.call(8, "donate", value=777)                                        # anyone may donate
    assert world.assembly()["treasury"] == "777"
    world.check_conservation()


def test_errored_payout_returns_to_the_commons(world):
    world.call(2, "donate", value=1000)
    world.vm.sender = world.accounts[0]
    world.vm.value = 321
    world.vm._balances[world.contract_address] = world.contract_balance() + 321   # refunded value arrives
    world.contract._instance.__on_errored_message__()
    world.vm.value = 0
    assert world.assembly()["treasury"] == "1321"
    world.check_conservation()


def test_withdraw_zeroes_the_ledger_before_paying(world):
    mid = file_adopt(world)
    pass_all(world, mid)
    owed = int(world.view("get_claimable", world.hex[1]))
    assert owed == BOND
    world.call(1, "withdraw")
    assert world.ledger()["claimable_total"] == "0"
    world.check_conservation()


def test_ledger_reports_insolvency_if_books_exceed_balance(world):
    world.call(2, "donate", value=1000)
    world.vm._balances[world.contract_address] = 10                            # simulate an impossible shortfall
    ledger = world.ledger()
    assert ledger["solvent"] is False and ledger["books"] == "1000" and ledger["balance"] == "10"


# --------------------------------------------------------------------------- #
# defensive VOID branches (unreachable through the public API; forced via storage)
# --------------------------------------------------------------------------- #
def run_to_enactment(world, mid):
    classify(world, mid)
    ballots(world, mid, yes=(0, 1, 2, 3, 4))
    world.advance(121)                                    # the frozen roster may hold extra, silent members
    world.call(3, "close_vote", mid)
    if world.motion(mid)["status"] == "CONTESTABLE":
        world.advance(121)
        world.call(4, "finalize", mid)
    return world.motion(mid)


def test_void_replace_of_a_vanished_article(world):
    world.call(1, "file_amendment", "A1", "Meetings are weekly.", 1, value=BOND)
    del world.contract.articles["A1"]
    m = run_to_enactment(world, 1)
    assert m["status"] == "VOID" and world.assembly()["stats"]["void"] == 1
    assert world.view("get_claimable", world.hex[1]) == str(BOND)
    assert world.assembly()["floor_motion"] == 0


def test_void_repeal_of_a_vanished_article(world):
    world.call(1, "file_amendment", "A1", "", 0, value=BOND)
    del world.contract.articles["A1"]
    assert run_to_enactment(world, 1)["status"] == "VOID"


def test_void_adopt_when_article_appeared_or_charter_filled(world):
    world.call(1, "file_amendment", "NEWS", "A digest.", 1, value=BOND)
    world.contract.articles["NEWS"] = json.dumps({"text": "squatter", "tier": 1})
    assert run_to_enactment(world, 1)["status"] == "VOID"
    del world.contract.articles["NEWS"]
    world.call(1, "file_amendment", "NEWS", "A digest.", 1, value=BOND)
    world.contract.article_count = 12
    assert run_to_enactment(world, 2)["status"] == "VOID"


def test_void_unfunded_grant(world):
    world.call(2, "donate", value=10 ** 16)
    world.call(1, "file_grant", world.hex[6], 10 ** 15, "Hall.", value=BOND)
    world.contract.treasury = 5
    m = run_to_enactment(world, 1)
    assert m["status"] == "VOID" and world.view("get_claimable", world.hex[6]) == "0"


def test_void_admission_and_expulsion_edge_cases(world):
    world.call(1, "file_admission", world.hex[8], "x", value=BOND)
    world.contract.members[world.hex[8]] = 1
    assert run_to_enactment(world, 1)["status"] == "VOID"
    world.call(1, "file_admission", world.hex[9], "x", value=BOND)
    world.contract.member_count = 15
    assert run_to_enactment(world, 2)["status"] == "VOID"
    world.contract.member_count = 6
    world.call(1, "file_expulsion", world.hex[4], "x", value=BOND)
    del world.contract.members[world.hex[4]]
    assert run_to_enactment(world, 3)["status"] == "VOID"
    world.contract.members[world.hex[4]] = 1
    world.call(1, "file_expulsion", world.hex[4], "x", value=BOND)
    world.contract.member_count = 3
    assert run_to_enactment(world, 4)["status"] == "VOID"
