#!/usr/bin/env python3
"""Can a smart-contract wallet (the Aerar Vault) pay through x402 on Base Sepolia?

x402 settles with USDC's transferWithAuthorization. Circle's USDC v2.2 accepts a `bytes signature` form that checks
contract wallets with ERC-1271. This script asks Base Sepolia (read-only, nothing is signed or sent, no keys needed):

  A. A fake wallet contract that approves any signature tries to move 1 unit it doesn't have.
     Supported  -> the signature passes and USDC complains about the balance.
     Unsupported -> USDC rejects the signature (or doesn't know the function).
  B. Control: the same call from a plain address must fail on the signature.

Run anywhere with Python 3 and internet:  python3 scripts/check-usdc-1271.py
"""
import json
import subprocess
import sys
import urllib.request

USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
RPCS = ["https://sepolia.base.org", "https://base-sepolia-rpc.publicnode.com"]
FAKE_WALLET = "0x00000000000000000000000000000000000a3a50"
# transferWithAuthorization(from=FAKE_WALLET, to=0x…dEaD, value=1, validAfter=0, validBefore=2100, nonce, signature=65 bytes)
CALLDATA = (
    "0xcf092995"
    "00000000000000000000000000000000000000000000000000000000000a3a50"
    "000000000000000000000000000000000000000000000000000000000000dead"
    "0000000000000000000000000000000000000000000000000000000000000001"
    "0000000000000000000000000000000000000000000000000000000000000000"
    "00000000000000000000000000000000000000000000000000000000f4865700"
    "abababababababababababababababababababababababababababababababab"
    "00000000000000000000000000000000000000000000000000000000000000e0"
    "0000000000000000000000000000000000000000000000000000000000000041"
    + "11" * 65 + "00" * 31
)
# Runtime code that answers every call with the ERC-1271 magic value 0x1626ba7e.
ALWAYS_VALID = "0x631626ba7e60e01b60005260206000f3"
SLOTS = {
    "EIP-1967": "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
    "zeppelinos": "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3",
}


def rpc(url, method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
    req = urllib.request.Request(url, data=body.encode(), headers={"content-type": "application/json", "user-agent": "aerar-check/1"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.load(r)
    except urllib.error.URLError as e:
        if "CERTIFICATE_VERIFY_FAILED" not in str(e):
            raise
        # python.org Python on macOS ships without root certificates; the system curl has them.
        out = subprocess.run(["curl", "-sS", "-m", "20", "-X", "POST", url, "-H", "content-type: application/json", "-d", body], capture_output=True, text=True, check=True)
        return json.loads(out.stdout)


def reason(resp):
    err = resp.get("error")
    if not err:
        return "no revert"
    data = err.get("data")
    if isinstance(data, dict):
        data = data.get("data")
    if isinstance(data, str) and data.startswith("0x08c379a0") and len(data) >= 138:
        n = int(data[74:138], 16)
        return bytes.fromhex(data[138 : 138 + 2 * n]).decode(errors="replace")
    return err.get("message", "unknown")


def main():
    for url in RPCS:
        try:
            chain = rpc(url, "eth_chainId", [])["result"]
            break
        except Exception as e:  # try the next RPC
            print(f"  {url}: {e}")
    else:
        sys.exit("Couldn't reach a Base Sepolia RPC.")
    print(f"RPC {url}  chain {int(chain, 16)} (expect 84532)")

    ver = rpc(url, "eth_call", [{"to": USDC, "data": "0x54fd4d50"}, "latest"]).get("result", "0x")
    try:
        n = int(ver[66:130], 16)
        print(f"USDC version(): {bytes.fromhex(ver[130:130 + 2 * n]).decode()}")
    except Exception:
        print("USDC version(): unreadable")
    for name, slot in SLOTS.items():
        impl = rpc(url, "eth_getStorageAt", [USDC, slot, "latest"]).get("result", "0x0")
        if int(impl, 16):
            print(f"Implementation ({name} slot): 0x{impl[-40:]}")

    call = {"from": "0x000000000000000000000000000000000000bEEF", "to": USDC, "data": CALLDATA}
    a = reason(rpc(url, "eth_call", [call, "latest", {FAKE_WALLET: {"code": ALWAYS_VALID}}]))
    b = reason(rpc(url, "eth_call", [call, "latest"]))
    print(f"A (contract wallet): {a}")
    print(f"B (plain address):   {b}")

    if "balance" in a.lower() and "signature" in b.lower():
        print("\nRESULT: SUPPORTED. USDC accepts contract-wallet signatures (ERC-1271). The Vault can pay through x402 directly.")
    elif "signature" in a.lower():
        print("\nRESULT: NOT SUPPORTED. USDC rejected the contract wallet's signature. Use the fallback: the Vault pays the provider itself.")
    else:
        print("\nRESULT: UNCLEAR. Send these lines to Claude.")


if __name__ == "__main__":
    main()
