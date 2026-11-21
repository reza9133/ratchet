"""Shared harness for the RATCHET test-suites (GenVM v0.2.16 Direct Mode).

* ``World``  wraps a Direct Mode VM + deployed contract and adds what Direct Mode
  does not model by itself: transaction rollback on revert, native-value
  accounting, emitted transfers, and leader/validator consensus emulation
  (leader runs once, every validator then re-runs its own assessment).
* ``FakeClerk`` is a deterministic stand-in for the LLM.  It reads the frozen
  EVIDENCE_JSON out of the prompt exactly like a real model would and answers
  with the strict JSON the contract demands.  Every validator can be given its
  own clerk so disagreement can be injected precisely.
"""
import json
import os
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
CONTRACT = os.environ.get("RATCHET_CONTRACT", str(ROOT / "contracts" / "Ratchet.py"))

WEI = 10 ** 18
BOND = 4 * 10 ** 15            # 0.004 GEN
T0 = "2026-11-01T12:00:00+00:00"

CHARTER = [
    {"id": "A1", "tier": 1, "text": "Meetings are held on the first Sunday of every month."},
    {"id": "A2", "tier": 4, "text": "Membership can only be granted or withdrawn by the assembly itself; no officer may add or remove a member alone."},
    {"id": "A3", "tier": 3, "text": "Treasury funds may never be spent on political campaigns."},
    {"id": "A4", "tier": 2, "text": "The newsletter is sent by e-mail once a month."},
]


class ConsensusFailed(Exception):
    """The transaction was rolled back because validators did not agree."""


class FakeClerk:
    """Deterministic fake LLM.

    ``implicit`` maps article id -> keywords.  Under the STRICT reading an
    article is touched only if the motion text names its id; under the
    INCLUSIVE reading a keyword hit also counts.  ``force`` pins specific
    answers; ``flip`` inverts specific answers (used to model a dissenting
    validator); ``fail`` makes the provider raise.
    """

    def __init__(self, implicit=None, force=None, flip=None, fail=None, malformed=None):
        self.implicit = implicit or {}
        self.force = force or {}
        self.flip = set(flip or [])
        self.fail = fail
        self.malformed = malformed
        self.prompts = []

    def __call__(self, data):
        prompt = data["prompt"]
        self.prompts.append(prompt)
        if self.fail:
            return {"error": self.fail}
        if self.malformed is not None:
            return {"ok": self.malformed}
        inclusive = "READING: INCLUSIVE" in prompt
        evidence = json.loads(prompt.split("EVIDENCE_JSON=", 1)[1])
        haystack = (evidence["motion_text"] + " " +
                    json.dumps(evidence["motion_detail"], sort_keys=True)).lower()
        touches = {}
        for article in evidence["articles"]:
            aid = article["id"]
            hit = re.search(r"\b" + re.escape(aid.lower()) + r"\b", haystack) is not None
            if not hit and inclusive:
                hit = any(word in haystack for word in self.implicit.get(aid, []))
            if aid in self.force:
                hit = self.force[aid]
            if aid in self.flip:
                hit = not hit
            touches[aid] = hit
        return {"ok": {"touches": touches, "reason": "Clerk reasoning for the record."}}


class World:
    def __init__(self, vm, deploy, accounts, deploy_args=None, clerk=None, deployer=None,
                 transfer_delay=0, initial_balance=1000 * WEI):
        self.vm = vm
        self.accounts = accounts
        self.hex = ["0x" + bytes(a).hex() for a in accounts]
        self.transfer_delay = transfer_delay    # seconds between a commit and its emitted transfer
        self.deferred = []                      # (due_offset, to_hex, wei)
        self.contract_address = None
        self.outbox = []              # (to_hex, wei) emitted transfers that committed
        self.message_kinds = []       # kind of every emitted message: "EthSend" (EVM, credits an account) or "PostMessage"
        self.balances = {}            # hex -> wei, mirrors vm._balances
        self.clerk = clerk or FakeClerk()
        self.validators = []          # extra FakeClerks, one per validator
        vm.warp(T0)
        vm._live_llm_handler = self.clerk
        vm._gl_call_hook = self._hook
        self._pending = []
        self.offset = 0
        for acct in accounts:
            self._set_balance(acct, initial_balance)
        args = deploy_args if deploy_args is not None else self.default_args()
        vm.sender = deployer if deployer is not None else accounts[0]
        self.contract = deploy(CONTRACT, *args)
        self.contract_address = vm._contract_address
        vm._balances[self.contract_address] = 0

    # ------------------------------------------------------------------ #
    def default_args(self, founders=None, charter=None, bond=BOND, vote=2, challenge=2):
        founders = founders if founders is not None else self.hex[:5]
        charter = CHARTER if charter is None else charter
        return ("Test Assembly", founders, json.dumps(charter), bond, vote, challenge)

    def _set_balance(self, acct, wei):
        self.vm._balances[bytes(acct)] = wei

    def settle(self):
        """Apply emitted transfers whose finality delay has elapsed (real chain: at FINALIZED)."""
        due = [d for d in self.deferred if d[0] <= self.offset]
        self.deferred = [d for d in self.deferred if d[0] > self.offset]
        for _due, to_hex, wei in due:
            self.vm._balances[self.contract_address] = self.vm._balances.get(self.contract_address, 0) - wei
            key = bytes.fromhex(to_hex[2:])
            self.vm._balances[key] = self.vm._balances.get(key, 0) + wei
            self.outbox.append((to_hex, wei))

    def balance(self, who):
        self.settle()
        key = bytes(who) if not isinstance(who, int) else bytes(self.accounts[who])
        return self.vm._balances.get(key, 0)

    def contract_balance(self):
        self.settle()
        return self.vm._balances.get(self.contract_address, 0)

    def _hook(self, vm, request):
        # A payout to an account is an EXTERNAL (EVM) message: `EthSend`.  `PostMessage` is the
        # GenVM-contract message and is NOT how an EOA is credited on Studionet, so the suite
        # accepts both shapes but the contract is required to use EthSend (see test_settlement).
        for kind in ("EthSend", "PostMessage"):
            if kind in request:
                msg = request[kind]
                to = msg["address"]
                raw = to.as_bytes if hasattr(to, "as_bytes") else bytes(to)
                self._pending.append(("0x" + bytes(raw).hex(), int(msg["value"]), kind))
                self.message_kinds.append(kind)
                return {"ok": None}
        return None

    # ------------------------------------------------------------------ #
    def warp(self, seconds_after_t0):
        from datetime import datetime, timedelta
        base = datetime.fromisoformat(T0)
        self.offset = seconds_after_t0
        self.vm.warp((base + timedelta(seconds=seconds_after_t0)).isoformat())

    def advance(self, seconds):
        self.warp(self.offset + seconds)

    def call(self, who, method, *args, value=0):
        """Execute one transaction with revert-rollback and consensus emulation."""
        acct = self.accounts[who] if isinstance(who, int) else who
        vm = self.vm
        self.settle()
        vm.sender = acct
        vm.value = value
        sender_balance = vm._balances.get(bytes(acct), 0)
        if value > sender_balance:
            raise AssertionError("test account cannot afford the attached value")
        snap = vm.snapshot()
        self._pending = []
        vm.clear_validators()
        try:
            vm._balances[bytes(acct)] = sender_balance - value
            vm._balances[self.contract_address] = vm._balances.get(self.contract_address, 0) + value
            result = getattr(self.contract, method)(*args)
            self._run_validators()
        except BaseException:
            vm.revert(snap)
            vm.value = 0
            raise
        finally:
            vm.value = 0
        for to_hex, wei, _on in self._pending:
            # emitted transfers settle at finalization (immediately unless a delay is configured)
            self.deferred.append((self.offset + self.transfer_delay, to_hex, wei))
        self._pending = []
        self.settle()
        return result

    def view(self, method, *args):
        self.settle()
        return getattr(self.contract, method)(*args)

    def _run_validators(self):
        vm = self.vm
        if not vm._captured_validators or not self.validators:
            return
        leader_handler = vm._live_llm_handler
        agree = 1  # the leader
        total = 1 + len(self.validators)
        try:
            for clerk in self.validators:
                vm._live_llm_handler = clerk
                try:
                    ok = vm.run_validator()
                except Exception:
                    ok = False
                if ok is True:
                    agree += 1
        finally:
            vm._live_llm_handler = leader_handler
        if agree * 2 <= total:
            raise ConsensusFailed("%d of %d agreed" % (agree, total))

    # convenience readers ------------------------------------------------ #
    def assembly(self):
        return json.loads(self.view("get_assembly"))

    def motion(self, motion_id):
        return json.loads(self.view("get_motion", motion_id))

    def ledger(self):
        return json.loads(self.view("get_ledger"))

    def sync_ledger_balance(self):
        """Point the contract's own balance at the simulated chain balance."""
        self.vm._balances[self.contract_address] = self.contract_balance()

    def check_conservation(self):
        ledger = self.ledger()
        books = int(ledger["books"])
        assert int(ledger["balance"]) == books, ledger


def reason_of(exc):
    return str(exc.value if hasattr(exc, "value") else exc)
