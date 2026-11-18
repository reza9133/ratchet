#!/usr/bin/env python3
"""Local Studionet stand-in: lets scripts/e2e.mjs run end to end WITHOUT the network.

The bridge executes the REAL contract file (contracts/Ratchet.py) on the REAL GenVM
v0.2.16 SDK through gltest Direct Mode, behind a tiny HTTP API that mimics the few
chain operations the e2e script needs (deploy, write, read, balance, fund, clock).

What it reproduces faithfully
  * calldata: the e2e script encodes arguments with genlayer-js and this bridge decodes
    them with the SDK's own decoder, so int/str/bool typing matches a real transaction;
  * revert semantics: a UserError rolls the whole transaction back (value included);
  * consensus: the leader runs once, then four validators each re-run their own
    assessment with the contract's real validator function; a majority is required,
    so a single differing boolean makes the transaction UNDETERMINED and changes nothing;
  * delayed value: emitted transfers settle only after finalization (60 s of sim time),
    the same behaviour that makes payout balances lag on the live network;
  * the clock only moves when the script asks for it (no real sleeping).

What it cannot reproduce: a real LLM.  `SimClerk` below is a keyword-driven stand-in
that answers the same strict-JSON question the contract asks, with a STRICT reading
(explicit statements) and an INCLUSIVE reading (implicit conflicts).

Run:  python scripts/sim_bridge.py --port 8765
"""
import argparse
import hashlib
import json
import pathlib
import re
import sys
import threading
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, HTTPServer

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tests"))

FINALITY_SECONDS = 60


class SimClerk:
    """Deterministic keyword clerk.  `flip` injects a dissenting validator."""

    STRICT = {
        "A1": ["a1", "first sunday"],
        "A2": ["a2"],
        "A3": ["a3", "political campaign"],
        "A4": ["a4", "monthly newsletter"],
    }
    INCLUSIVE = {
        "A1": ["meeting schedule"],
        "A2": ["admit new members", "add members at will", "remove members", "without a vote of the assembly"],
        "A3": ["any purpose", "without restriction", "campaign"],
        "A4": ["mailing list"],
    }

    def __init__(self, flip=None):
        self.flip = set(flip or [])
        self.calls = 0

    def __call__(self, data):
        self.calls += 1
        prompt = data["prompt"]
        inclusive = "READING: INCLUSIVE" in prompt
        evidence = json.loads(prompt.split("EVIDENCE_JSON=", 1)[1])
        text = (evidence["motion_text"] + " " + json.dumps(evidence["motion_detail"], sort_keys=True)).lower()
        touches = {}
        for article in evidence["articles"]:
            aid = article["id"]
            words = list(self.STRICT.get(aid, [aid.lower()]))
            if inclusive:
                words += self.INCLUSIVE.get(aid, [])
            hit = any(re.search(r"(?<![a-z0-9])" + re.escape(w) + r"(?![a-z0-9])", text) for w in words)
            if aid in self.flip:
                hit = not hit
            touches[aid] = hit
        mode = "inclusive" if inclusive else "strict"
        return {"ok": {"touches": touches, "reason": "Simulated %s reading by the keyword clerk." % mode}}


class Bridge:
    def __init__(self, contract_path):
        import os
        os.environ["RATCHET_CONTRACT"] = str(pathlib.Path(contract_path).resolve())   # helpers.World deploys this file
        from gltest.direct.loader import deploy_contract
        from gltest.direct.vm import VMContext
        from helpers import World

        self.World = World
        self.deploy_contract = deploy_contract
        self.contract_path = pathlib.Path(contract_path)
        self.source = self.contract_path.read_text()
        self.ctx = VMContext()
        self.stack = self.ctx.activate()
        self.stack.__enter__()
        from gltest.direct.sdk_loader import setup_sdk_paths
        setup_sdk_paths(self.contract_path, "v0.2.16")      # makes `genlayer` importable (GenVM v0.2.16)
        import genlayer.py.calldata as calldata
        self.calldata = calldata
        self.world = None
        self.address = None
        self.tx_count = 0
        self.receipts = {}
        self.dissent = {}          # method -> remaining AI transactions whose validators will dissent
        self.lock = threading.Lock()
        self.fund_log = {}

    # ------------------------------------------------------------------ #
    @staticmethod
    def raw(addr):
        text = addr.lower()
        if not re.fullmatch(r"0x[0-9a-f]{40}", text):
            raise ValueError("bad address %r" % addr)
        return bytes.fromhex(text[2:])

    def now(self):
        base = datetime.fromisoformat("2026-11-01T12:00:00+00:00")
        offset = self.world.offset if self.world else 0
        return int((base + timedelta(seconds=offset)).timestamp())

    def fund(self, addr, wei):
        key = self.raw(addr)
        vm = self.ctx
        vm._balances[key] = vm._balances.get(key, 0) + int(wei)
        return vm._balances[key]

    def balance(self, addr):
        key = self.raw(addr)
        if self.world:
            self.world.settle()
        return self.ctx._balances.get(key, 0)

    def advance(self, seconds):
        if self.world is None:
            return 0
        self.world.advance(int(seconds))
        self.world.settle()
        return self.now()

    # ------------------------------------------------------------------ #
    def receipt(self, kind, sender, to, error=None, status=None):
        self.tx_count += 1
        digest = hashlib.sha256(("sim-tx-%d" % self.tx_count).encode()).hexdigest()
        h = "0x" + digest
        if kind == "OK":
            status_name, result_name, execution = "ACCEPTED", "MAJORITY_AGREE", "SUCCESS"
        elif kind == "EXEC_ERROR":
            status_name, result_name, execution = "ACCEPTED", "MAJORITY_AGREE", "ERROR"
        else:  # UNDETERMINED
            status_name, result_name, execution = "UNDETERMINED", "NO_MAJORITY", "SUCCESS"
        rec = {
            "hash": h, "status_name": status_name, "result_name": result_name,
            "from_address": sender, "to_address": to,
            "consensus_data": {"leader_receipt": [{
                "mode": "leader", "execution_result": execution,
                "result": {"payload": {"readable": error}} if error else {"status": "return"},
            }]},
            "created_at": self.now(),
        }
        self.receipts[h] = rec
        return rec

    def deploy(self, sender, code, args_hex):
        if hashlib.sha256(code.encode()).hexdigest() != hashlib.sha256(self.source.encode()).hexdigest():
            return self.receipt("EXEC_ERROR", sender, None, error="deployed source differs from contracts/Ratchet.py")
        decoded = self.calldata.decode(bytes.fromhex(args_hex))
        args = decoded.get("args", [])
        self.world = self.World(
            self.ctx, lambda path, *a: self.deploy_contract(pathlib.Path(path), self.ctx, *a), [],
            deploy_args=tuple(args), clerk=SimClerk(), deployer=self.raw(sender),
            transfer_delay=FINALITY_SECONDS)
        self.address = "0x" + self.world.contract_address.hex()
        self.world.vm._balances[self.world.contract_address] = 0
        rec = self.receipt("OK", sender, self.address)
        rec["data"] = {"contract_address": self.address}
        return rec

    def write(self, sender, address, data_hex, value):
        decoded = self.calldata.decode(bytes.fromhex(data_hex))
        method, args = decoded["method"], decoded.get("args", [])
        w = self.world
        leader_clerk = SimClerk()
        w.vm._live_llm_handler = leader_clerk
        remaining = self.dissent.get(method, 0)
        if remaining > 0 and method in ("classify", "challenge"):
            w.validators = [SimClerk(flip=["A1"]) for _ in range(4)]
            self.dissent[method] = remaining - 1
        else:
            w.validators = [SimClerk() for _ in range(4)]
        try:
            w.call(self.raw(sender), method, *args, value=int(value))
        except Exception as exc:
            name = type(exc).__name__
            if name == "ConsensusFailed":
                return self.receipt("UNDETERMINED", sender, address)
            if name == "UserError":
                return self.receipt("EXEC_ERROR", sender, address, error=str(exc))
            raise
        return self.receipt("OK", sender, address)

    def read(self, address, data_hex):
        decoded = self.calldata.decode(bytes.fromhex(data_hex))
        method, args = decoded["method"], decoded.get("args", [])
        try:
            result = self.world.view(method, *args)
        except Exception as exc:
            return {"error": str(exc)}
        if isinstance(result, bool):
            return {"type": "bool", "value": result}
        if isinstance(result, int):
            return {"type": "int", "value": str(result)}
        return {"type": "str", "value": result}


def make_handler(bridge):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _send(self, code, payload):
            body = json.dumps(payload).encode()
            self.send_response(code)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path == "/health":
                return self._send(200, {"ok": True, "now": bridge.now()})
            self._send(404, {"error": "unknown path"})

        def do_POST(self):
            length = int(self.headers.get("content-length", "0"))
            body = json.loads(self.rfile.read(length) or b"{}")
            try:
                with bridge.lock:
                    out = self.route(body)
                self._send(200, out)
            except Exception as exc:  # report bridge bugs loudly instead of hiding them
                import traceback
                traceback.print_exc()
                self._send(500, {"error": "%s: %s" % (type(exc).__name__, exc)})

        def route(self, body):
            p = self.path
            if p == "/fund":
                return {"balance": str(bridge.fund(body["address"], body["wei"]))}
            if p == "/balance":
                return {"balance": str(bridge.balance(body["address"]))}
            if p == "/now":
                return {"now": bridge.now()}
            if p == "/advance":
                return {"now": bridge.advance(body["seconds"])}
            if p == "/deploy":
                return bridge.deploy(body["sender"], body["code"], body["args_hex"])
            if p == "/write":
                return bridge.write(body["sender"], body["address"], body["data_hex"], body.get("value", "0"))
            if p == "/read":
                return bridge.read(body["address"], body["data_hex"])
            if p == "/finalize":
                bridge.advance(FINALITY_SECONDS + 1)
                rec = dict(bridge.receipts[body["hash"]])
                if rec["status_name"] == "ACCEPTED":
                    rec["status_name"] = "FINALIZED"
                return rec
            if p == "/chaos":
                bridge.dissent[body["method"]] = int(body["times"])
                return {"ok": True}
            return {"error": "unknown path"}
    return Handler


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--contract", default=str(ROOT / "contracts" / "Ratchet.py"))
    ns = ap.parse_args()
    bridge = Bridge(ns.contract)
    server = HTTPServer(("127.0.0.1", ns.port), make_handler(bridge))
    print("sim bridge listening on 127.0.0.1:%d" % ns.port, flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
