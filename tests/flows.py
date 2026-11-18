"""Small reusable flows so the individual tests stay readable."""
from helpers import BOND


def file_adopt(world, who=1, aid="NEWS", text="A weekly digest is posted on the website.", tier=1):
    world.call(who, "file_amendment", aid, text, tier, value=BOND)
    return world.assembly()["motion_count"]


def classify(world, mid, by=2):
    world.call(by, "classify", mid)
    return world.motion(mid)


def ballots(world, mid, yes=(), no=()):
    for i in yes:
        world.call(i, "vote", mid, True)
    for i in no:
        world.call(i, "vote", mid, False)


def open_vote(world, who=1, **kw):
    mid = file_adopt(world, who, **kw)
    classify(world, mid)
    return mid


def finish_uncontested(world, mid, by=4):
    world.advance(121)
    world.call(by, "finalize", mid)
    return world.motion(mid)
