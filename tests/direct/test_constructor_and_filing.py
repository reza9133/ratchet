"""Constructor validation, filing rules and the pure helper functions."""
import json
import sys

import pytest

from helpers import BOND, CHARTER, World
from flows import file_adopt


def deploy_with(direct_vm, direct_deploy, direct_accounts, name="X", founders=None, charter=None,
                bond=BOND, vote=2, challenge=2):
    hexes = ["0x" + bytes(a).hex() for a in direct_accounts]
    founders = hexes[:5] if founders is None else founders
    charter = CHARTER if charter is None else charter
    args = (name, founders, charter if isinstance(charter, str) else json.dumps(charter),
            bond, vote, challenge)
    direct_vm.sender = direct_accounts[0]
    return World(direct_vm, direct_deploy, direct_accounts, deploy_args=args)


# --------------------------------------------------------------------------- #
# constructor
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("kw,match", [
    ({"name": "   "}, "invalid name"),
    ({"name": "x" * 61}, "invalid name"),
    ({"founders": []}, "founders must number"),
    ({"founders": "0x" + "1" * 40}, "founders must be a list"),
    ({"founders": ["0x" + "11" * 20, "0x" + "22" * 20]}, "founders must number"),
    ({"founders": ["0x" + "11" * 20] * 3}, "duplicate founder"),
    ({"founders": ["0x" + "11" * 20, "0x" + "22" * 20, "0x" + "00" * 20]}, "zero address"),
    ({"founders": ["0x" + "11" * 20, "0x" + "22" * 20, "nothex"]}, "invalid address"),
    ({"bond": 0}, "bond must be"),
    ({"bond": 10 ** 24 + 1}, "bond must be"),
    ({"vote": 1}, "duration must be"),
    ({"challenge": 10081}, "duration must be"),
    ({"charter": "not json"}, "not valid JSON"),
    ({"charter": json.dumps({"id": "A1"})}, "list of at most"),
    ({"charter": [{"id": "a1", "text": "x", "tier": 1}]}, "invalid or duplicate article id"),
    ({"charter": [{"id": "A1", "text": "x", "tier": 1}, {"id": "A1", "text": "y", "tier": 2}]},
     "invalid or duplicate article id"),
    ({"charter": [{"id": "A1", "text": "x", "tier": 5}]}, "tier must be an integer 1-4"),
    ({"charter": [{"id": "A1", "text": "x", "tier": True}]}, "tier must be an integer 1-4"),
    ({"charter": [{"id": "A1", "text": "x"}]}, "exactly id, text, tier"),
    ({"charter": [{"id": "A1", "text": "", "tier": 1}]}, "invalid article text"),
    ({"charter": [{"id": "A%d" % i, "text": "x", "tier": 1} for i in range(13)]}, "at most 12"),
])
def test_constructor_rejects(direct_vm, direct_deploy, direct_accounts, kw, match):
    with pytest.raises(Exception, match=match):
        deploy_with(direct_vm, direct_deploy, direct_accounts, **kw)


def test_constructor_accepts_boundaries(direct_vm, direct_deploy, direct_accounts):
    w = deploy_with(direct_vm, direct_deploy, direct_accounts, charter=[], bond=1, vote=2, challenge=10080)
    a = w.assembly()
    assert a["article_count"] == 0 and a["bond"] == "1" and a["challenge_minutes"] == 10080


def test_constructor_accepts_twelve_articles(direct_vm, direct_deploy, direct_accounts):
    w2 = deploy_with(direct_vm, direct_deploy, direct_accounts,
                     charter=[{"id": "A%d" % i, "text": "t", "tier": 1} for i in range(12)])
    assert w2.assembly()["article_count"] == 12


def test_constructor_accepts_raw_bytes_and_checksummed_strings(direct_vm, direct_deploy, direct_accounts):
    from eth_utils import to_checksum_address
    checksummed = to_checksum_address("0x" + bytes(direct_accounts[2]).hex())
    assert checksummed != checksummed.lower()
    founders = [bytes(direct_accounts[0]), bytes(direct_accounts[1]), checksummed]
    w = deploy_with(direct_vm, direct_deploy, direct_accounts, founders=founders)
    assert w.assembly()["members"] == sorted(w.hex[:3])


# --------------------------------------------------------------------------- #
# filing
# --------------------------------------------------------------------------- #
def test_only_members_can_file(world):
    with pytest.raises(Exception, match="members only"):
        world.call(7, "file_amendment", "NEWS", "text", 1, value=BOND)


def test_bond_must_be_exact(world):
    for wrong in (0, BOND - 1, BOND + 1, 2 * BOND):
        with pytest.raises(Exception, match="attach exactly the bond"):
            world.call(1, "file_amendment", "NEWS", "text", 1, value=wrong)
    assert world.assembly()["motion_count"] == 0
    assert world.contract_balance() == 0


def test_floor_lock_allows_one_motion_at_a_time(world):
    mid = file_adopt(world)
    assert world.assembly()["floor_motion"] == mid
    with pytest.raises(Exception, match="floor is held"):
        world.call(2, "file_amendment", "OTHER", "text", 1, value=BOND)
    with pytest.raises(Exception, match="floor is held"):
        world.call(2, "file_admission", world.hex[7], "please", value=BOND)
    # failed attempts must not leave a bond behind
    assert world.contract_balance() == BOND
    world.check_conservation()


@pytest.mark.parametrize("aid", ["", "a1", "1A", "A-1", "A" * 13, "A B", "Ä1"])
def test_bad_article_ids(world, aid):
    with pytest.raises(Exception, match="article id must be"):
        world.call(1, "file_amendment", aid, "text", 1, value=BOND)


def test_amendment_rules(world):
    with pytest.raises(Exception, match="cannot repeal an article that does not exist"):
        world.call(1, "file_amendment", "NOPE", "", 0, value=BOND)
    with pytest.raises(Exception, match="new_tier must be 1-4"):
        world.call(1, "file_amendment", "NOPE", "text", 0, value=BOND)
    with pytest.raises(Exception, match="new_tier must be 1-4"):
        world.call(1, "file_amendment", "NOPE", "text", 5, value=BOND)
    with pytest.raises(Exception, match="new_tier must be 1-4"):
        world.call(1, "file_amendment", "A1", "new text", 0, value=BOND)
    with pytest.raises(Exception, match="repeal requires new_tier 0"):
        world.call(1, "file_amendment", "A1", "", 2, value=BOND)
    with pytest.raises(Exception, match="amendment changes nothing"):
        world.call(1, "file_amendment", "A1", CHARTER[0]["text"], 1, value=BOND)
    with pytest.raises(Exception, match="new_text too long or invalid"):
        world.call(1, "file_amendment", "NEWS", "x" * 501, 1, value=BOND)
    with pytest.raises(Exception, match="new_tier must be an integer"):
        world.call(1, "file_amendment", "NEWS", "text", True, value=BOND)
    assert world.assembly()["motion_count"] == 0
    assert world.contract_balance() == 0


def test_floor_tier_follows_target_article(world):
    world.call(1, "file_amendment", "A2", "Membership changes need the assembly.", 4, value=BOND)
    assert world.motion(1)["floor_tier"] == 4
    world.call(1, "withdraw_motion", 1)
    world.call(1, "file_amendment", "A1", "Meetings are weekly.", 1, value=BOND)
    assert world.motion(2)["floor_tier"] == 1
    world.call(1, "withdraw_motion", 2)
    world.call(1, "file_amendment", "A4", "", 0, value=BOND)          # repeal of a tier-2 article
    m = world.motion(3)
    assert m["floor_tier"] == 2 and m["detail"]["action"] == "REPEAL"
    assert m["text"] == "Repeal article A4"


def test_full_charter_blocks_adoption(direct_vm, direct_deploy, direct_accounts):
    w = deploy_with(direct_vm, direct_deploy, direct_accounts,
                    charter=[{"id": "A%d" % i, "text": "t", "tier": 1} for i in range(12)])
    with pytest.raises(Exception, match="charter is full"):
        w.call(1, "file_amendment", "EXTRA", "text", 1, value=BOND)
    # replacing an existing article is still possible
    w.call(1, "file_amendment", "A1", "changed", 1, value=BOND)


def test_grant_filing_rules_and_floor(world):
    with pytest.raises(Exception, match="within the treasury"):
        world.call(1, "file_grant", world.hex[6], 1, "purpose", value=BOND)        # empty treasury
    world.call(2, "donate", value=10 * 10 ** 15)
    assert world.assembly()["treasury"] == str(10 * 10 ** 15)
    with pytest.raises(Exception, match="within the treasury"):
        world.call(1, "file_grant", world.hex[6], 0, "purpose", value=BOND)
    with pytest.raises(Exception, match="within the treasury"):
        world.call(1, "file_grant", world.hex[6], 10 * 10 ** 15 + 1, "purpose", value=BOND)
    with pytest.raises(Exception, match="invalid address"):
        world.call(1, "file_grant", "0x12", 10, "purpose", value=BOND)
    with pytest.raises(Exception, match="invalid purpose"):
        world.call(1, "file_grant", world.hex[6], 10, "  ", value=BOND)
    for amount, tier in ((10 ** 15, 1), (10 ** 15 + 1, 2), (5 * 10 ** 15, 2), (5 * 10 ** 15 + 1, 3),
                         (10 * 10 ** 15, 3)):
        world.call(1, "file_grant", world.hex[6], amount, "fund the hall rental", value=BOND)
        mid = world.assembly()["motion_count"]
        assert world.motion(mid)["floor_tier"] == tier, (amount, tier)
        world.call(1, "withdraw_motion", mid)


def test_admission_and_expulsion_rules(world):
    with pytest.raises(Exception, match="already a member"):
        world.call(1, "file_admission", world.hex[2], "x", value=BOND)
    with pytest.raises(Exception, match="not a member"):
        world.call(1, "file_expulsion", world.hex[8], "x", value=BOND)
    world.call(1, "file_admission", world.hex[8], "She is a long-time volunteer.", value=BOND)
    assert world.motion(1)["floor_tier"] == 2
    world.call(1, "withdraw_motion", 1)
    world.call(1, "file_expulsion", world.hex[3], "Repeated absence.", value=BOND)
    assert world.motion(2)["floor_tier"] == 3


def test_expulsion_blocked_at_minimum_roster(direct_vm, direct_deploy, direct_accounts):
    w = deploy_with(direct_vm, direct_deploy, direct_accounts,
                    founders=["0x" + bytes(a).hex() for a in direct_accounts[:3]])
    with pytest.raises(Exception, match="below the minimum"):
        w.call(0, "file_expulsion", w.hex[1], "x", value=BOND)


def test_admission_blocked_when_roster_full(direct_vm, direct_deploy, direct_accounts):
    founders = ["0x" + "%040x" % (i + 100) for i in range(15)]
    founders[0] = "0x" + bytes(direct_accounts[0]).hex()
    w = deploy_with(direct_vm, direct_deploy, direct_accounts, founders=founders)
    with pytest.raises(Exception, match="roster is full"):
        w.call(0, "file_admission", w.hex[7], "x", value=BOND)


def test_filing_snapshot_is_frozen(world):
    mid = file_adopt(world)
    m = world.motion(mid)
    assert m["roster"] == sorted(world.hex[:5])
    assert [a["id"] for a in m["articles"]] == ["A1", "A2", "A3", "A4"]
    assert len(m["digest"]) == 64
    assert m["bond"] == BOND and m["bond_left"] == BOND


def test_address_forms_are_normalized(world):
    from eth_utils import to_checksum_address
    mixed = to_checksum_address(world.hex[8])                  # EIP-55 checksummed
    assert mixed != world.hex[8]
    world.call(1, "file_admission", mixed, "statement", value=BOND)
    assert world.motion(1)["detail"]["candidate"] == world.hex[8]
    world.call(1, "withdraw_motion", 1)
    world.call(1, "file_admission", "0x" + world.hex[8][2:].upper(), "statement", value=BOND)
    assert world.motion(2)["detail"]["candidate"] == world.hex[8]
    world.call(1, "withdraw_motion", 2)
    world.call(1, "file_admission", bytes(world.accounts[8]), "statement", value=BOND)
    assert world.motion(3)["detail"]["candidate"] == world.hex[8]


# --------------------------------------------------------------------------- #
# pure helpers
# --------------------------------------------------------------------------- #
@pytest.fixture
def mod(world):
    return sys.modules[type(world.contract._instance).__module__]


def test_threshold_table(mod):
    from fractions import Fraction
    from math import ceil
    spot = {3: (2, 2, 3, 3), 4: (3, 3, 4, 4), 5: (3, 4, 4, 5), 7: (4, 5, 6, 7), 9: (5, 6, 8, 9)}
    for n, row in spot.items():
        assert tuple(mod.threshold_votes(t, n) for t in (1, 2, 3, 4)) == row, n
    for n in range(1, 40):
        oracle = (n // 2 + 1, ceil(Fraction(2 * n, 3)), ceil(Fraction(4 * n, 5)), n)
        assert tuple(mod.threshold_votes(t, n) for t in (1, 2, 3, 4)) == oracle, n
    for n in range(3, 16):
        values = [mod.threshold_votes(t, n) for t in (1, 2, 3, 4)]
        assert values == sorted(values) and values[0] > n / 2 and values[3] == n
    with pytest.raises(ValueError):
        mod.threshold_votes(5, 5)


def test_quote_threshold_view(world, mod):
    assert world.view("quote_threshold", 4, 5) == 5
    with pytest.raises(Exception, match="tier must be 1-4"):
        world.view("quote_threshold", 0, 5)
    with pytest.raises(Exception, match="roster_size"):
        world.view("quote_threshold", 2, 0)
    with pytest.raises(Exception, match="roster_size"):
        world.view("quote_threshold", 2, 16)


def test_derive_tier(mod):
    tiers = {"A": 2, "B": 4, "C": 1}
    assert mod.derive_tier(1, {"A": False, "B": False, "C": False}, tiers) == 1
    assert mod.derive_tier(1, {"A": True, "B": False, "C": True}, tiers) == 2
    assert mod.derive_tier(3, {"A": True, "B": False, "C": True}, tiers) == 3
    assert mod.derive_tier(1, {"A": True, "B": True, "C": True}, tiers) == 4


def test_normalize_assessment_is_strict(mod):
    ids = ["A1", "A2"]
    ok = {"touches": {"A1": True, "A2": False}, "reason": "  fine  \n reason "}
    assert mod.normalize_assessment(ok, ids) == ({"A1": True, "A2": False}, "fine reason")
    for bad in (None, [], "x", {}, {"touches": []}, {"touches": {"A1": True}},
                {"touches": {"A1": True, "A2": False, "A3": False}},
                {"touches": {"A1": "true", "A2": False}}, {"touches": {"A1": 1, "A2": 0}},
                {"touches": {"A1": None, "A2": False}}, {"touches": {"a1": True, "A2": False}}):
        assert mod.normalize_assessment(bad, ids) is None, bad
    # free text never invalidates an answer
    for reason in (None, 5, "", "   ", "x" * 5000):
        parsed = mod.normalize_assessment({"touches": {"A1": True, "A2": True}, "reason": reason}, ids)
        assert parsed is not None and 1 <= len(parsed[1]) <= mod.MAX_REASON_CHARS


def test_well_formed_requires_consistent_tier(mod):
    ids, tiers = ["A", "B"], {"A": 2, "B": 4}
    good = {"touches": {"A": True, "B": False}, "tier": 2, "reason": "r"}
    assert mod.well_formed(good, ids, tiers, 1)
    assert not mod.well_formed({**good, "tier": 3}, ids, tiers, 1)
    assert not mod.well_formed({**good, "tier": 1}, ids, tiers, 1)
    assert not mod.well_formed({**good, "tier": True}, ids, tiers, 1)
    assert not mod.well_formed({**good, "extra": 1}, ids, tiers, 1)
    assert not mod.well_formed({"touches": good["touches"], "tier": 2}, ids, tiers, 1)
    assert not mod.well_formed({**good, "reason": 5}, ids, tiers, 1)
    assert not mod.well_formed({**good, "touches": {"A": True}}, ids, tiers, 1)
    assert not mod.well_formed({**good, "touches": {"A": 1, "B": 0}}, ids, tiers, 1)
    assert not mod.well_formed("nope", ids, tiers, 1)


def test_valid_article_id(mod):
    for good in ("A", "A1", "Z_9", "NEWSLETTER12", "A" * 12):
        assert mod.valid_article_id(good), good
    for bad in ("", "a", "1A", "_A", "A-", "A" * 13, "A B", None, 5, "É"):
        assert not mod.valid_article_id(bad), bad


@pytest.mark.parametrize("bad", [0, -1, 2, 2 ** 32, 2 ** 40, 2 ** 255])
def test_out_of_range_motion_ids_are_clean_reverts(world, bad):
    file_adopt(world)                                              # exactly one motion exists
    for method, args in (("classify", (bad,)), ("vote", (bad, True)), ("close_vote", (bad,)),
                         ("finalize", (bad,)), ("expire_motion", (bad,)), ("withdraw_motion", (bad,))):
        with pytest.raises(Exception, match="motion not found"):
            world.call(1, method, *args)
    with pytest.raises(Exception, match="motion not found"):
        world.view("get_motion", bad)


def test_nul_bytes_are_rejected_everywhere(world):
    with pytest.raises(Exception, match="new_text too long or invalid"):
        world.call(1, "file_amendment", "NEWS", "a\x00b", 1, value=BOND)
    with pytest.raises(Exception, match="invalid statement"):
        world.call(1, "file_admission", world.hex[8], "a\x00b", value=BOND)
