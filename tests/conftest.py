import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import pytest  # noqa: E402

from helpers import World  # noqa: E402


@pytest.fixture
def world(direct_vm, direct_deploy, direct_accounts):
    return World(direct_vm, direct_deploy, direct_accounts)
