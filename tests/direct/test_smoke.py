import json
from helpers import BOND


def test_deploy_and_read(world):
    a = world.assembly()
    assert a["member_count"] == 5 and a["article_count"] == 4 and a["floor_motion"] == 0
    charter = json.loads(world.view("get_charter"))
    assert [x["id"] for x in charter["articles"]] == ["A1", "A2", "A3", "A4"]


def test_happy_path_adopt_article(world):
    world.call(1, "file_amendment", "NEWS", "A weekly digest is posted on the website.", 1, value=BOND)
    m = world.motion(1)
    assert m["status"] == "FILED" and m["floor_tier"] == 1
    world.call(2, "classify", 1)
    m = world.motion(1)
    assert m["status"] == "VOTING" and m["tier"] == 1
    for i in range(5):
        world.call(i, "vote", 1, True)
    world.call(3, "close_vote", 1)
    m = world.motion(1)
    assert m["status"] == "CONTESTABLE", m
    world.warp(3 * 60)
    world.call(4, "finalize", 1)
    m = world.motion(1)
    assert m["status"] == "ENACTED", m
    assert world.assembly()["article_count"] == 5
    assert world.view("get_claimable", world.hex[1]) == str(BOND)
    world.sync_ledger_balance()
    world.check_conservation()
    world.call(1, "withdraw")
    assert world.outbox == [(world.hex[1], BOND)]
