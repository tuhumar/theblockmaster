/**
 * Brainwallet — passphrase → SHA-256 → secp256k1 private key.
 * Classic style; insecure for real funds — lab / education only.
 */
import { sha256, bytesToHex } from "../core/hash.js";
import { N } from "../core/secp256k1.js";
import { hexToBig, bigToHex } from "../core/modular.js";
import { deriveFromPrivate } from "../core/formats.js";

const $ = (id) => document.getElementById(id);

function flash(msg, kind = "info") {
  const el = $("bw-flash");
  if (!el) return;
  el.innerHTML = `<div class="msg ${kind}">${msg}</div>`;
}

function setVal(id, v) {
  const el = $(id);
  if (el) el.value = v == null ? "" : String(v);
}

function passphraseToPriv(pass, { compressedHash = false } = {}) {
  const bytes = new TextEncoder().encode(String(pass ?? ""));
  let dig = sha256(bytes);
  if (compressedHash) dig = sha256(dig); // optional double-sha mode
  let k = hexToBig(bytesToHex(dig));
  // clamp into [1, n-1] like some classic tools (mod n, skip 0)
  k = ((k % N) + N) % N;
  if (k === 0n) k = 1n;
  return bigToHex(k, 64);
}

function sendToEqir(privHex, chain = "btc") {
  if (!privHex) return;
  if (typeof window.__tbmShowPage === "function") window.__tbmShowPage("lab", { chain });
  else location.hash = `#lab/${chain === "evm" ? "eth" : "btc"}`;
  const tick = (n = 0) => {
    const priv = document.getElementById("priv");
    if (!priv) {
      if (n < 20) setTimeout(() => tick(n + 1), 40);
      return;
    }
    priv.value = privHex;
    priv.dispatchEvent(new Event("input", { bubbles: true }));
    if (typeof window.__eqirSetChain === "function") {
      window.__eqirSetChain(chain === "evm" ? "evm" : "btc", { syncHash: false });
    }
  };
  requestAnimationFrame(() => tick());
}

function refresh() {
  const pass = $("bw-pass")?.value ?? "";
  if (!pass) {
    [
      "bw-priv",
      "bw-wif-c",
      "bw-wif-u",
      "bw-pub",
      "bw-p2pkh",
      "bw-p2wpkh",
      "bw-eth",
    ].forEach((id) => setVal(id, ""));
    return;
  }
  try {
    const mode = $("bw-mode")?.value || "sha256";
    const priv = passphraseToPriv(pass, { compressedHash: mode === "hash256" });
    const d = deriveFromPrivate(priv);
    setVal("bw-priv", d.priv_hex);
    setVal("bw-wif-c", d.wif_compressed);
    setVal("bw-wif-u", d.wif_uncompressed);
    setVal("bw-pub", d.pubkey_compressed);
    setVal("bw-p2pkh", d.btc_p2pkh_compressed);
    setVal("bw-p2wpkh", d.btc_p2wpkh);
    setVal("bw-eth", d.eth_address);
    flash("Derived locally from passphrase.", "ok");
  } catch (e) {
    flash(e.message || String(e), "warn");
  }
}

export function initBrainwalletUi() {
  if (!$("bw-pass")) return;
  ["bw-pass", "bw-mode"].forEach((id) => {
    $(id)?.addEventListener("input", refresh);
    $(id)?.addEventListener("change", refresh);
  });
  $("btn-bw-eqir")?.addEventListener("click", () =>
    sendToEqir($("bw-priv")?.value || "", "btc")
  );
  $("btn-bw-eqir-eth")?.addEventListener("click", () =>
    sendToEqir($("bw-priv")?.value || "", "evm")
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initBrainwalletUi);
} else {
  initBrainwalletUi();
}
