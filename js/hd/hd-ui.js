/**
 * BIP39 + BIP32 lab UI — EQIR card look.
 * Credits: Ian Coleman BIP39 (MIT), bip32.org (public domain lineage).
 */
import {
  generateMnemonic,
  mnemonicToSeed,
  mnemonicToSeedHex,
  validateMnemonic,
  normalizeMnemonic,
} from "./bip39.js";
import {
  fromSeed,
  fromBase58,
  toBase58,
  neuter,
  derivePath,
  deriveChild,
  HARDENED,
  nodeInfo,
  nodeToDerived,
} from "./bip32.js";
import { sha256, bytesToHex } from "../core/hash.js";
import { pbkdf2HmacSha512 } from "./sha512.js";

const $ = (id) => document.getElementById(id);

function setVal(id, v) {
  const el = $(id);
  if (el) el.value = v == null ? "" : String(v);
}

function setText(id, v) {
  const el = $(id);
  if (el) el.textContent = v == null ? "" : String(v);
}

function flash(msg, kind = "info", where = "bip39") {
  const el = $(where === "bip32" ? "hd-flash-bip32" : "hd-flash-bip39") || $("hd-flash-bip39");
  if (!el) return;
  el.innerHTML = `<div class="msg ${kind}">${msg}</div>`;
}

function sendToEqir(privHex, chain = "btc", where = "bip39") {
  if (!privHex) {
    flash("No private key to send.", "warn", where);
    return;
  }
  const go = typeof window.__tbmShowPage === "function" ? window.__tbmShowPage : null;
  if (go) go("lab", { chain });
  else location.hash = `#lab/${chain === "evm" ? "eth" : "btc"}`;
  const apply = () => {
    const priv = document.getElementById("priv");
    if (!priv) return false;
    priv.value = privHex;
    priv.dispatchEvent(new Event("input", { bubbles: true }));
    if (typeof window.__eqirSetChain === "function") {
      window.__eqirSetChain(chain === "evm" ? "evm" : "btc", { syncHash: false });
    }
    return true;
  };
  let n = 0;
  const tick = () => {
    if (apply() || n++ > 20) return;
    setTimeout(tick, 40);
  };
  requestAnimationFrame(tick);
  flash("Opened EQIR Lab with this private key.", "ok", where);
}

function currentPhrase() {
  return normalizeMnemonic($("bip39-phrase")?.value || "").join(" ");
}

function refreshBip39() {
  const phrase = currentPhrase();
  const pass = $("bip39-pass")?.value || "";
  const status = $("bip39-status");
  if (!phrase) {
    setVal("bip39-seed", "");
    setVal("bip39-root-xprv", "");
    setVal("bip39-root-xpub", "");
    setVal("bip39-acct-xprv", "");
    setVal("bip39-acct-xpub", "");
    $("bip39-table-body").innerHTML = "";
    if (status) status.textContent = "";
    return;
  }
  try {
    if (!validateMnemonic(phrase)) throw new Error("invalid mnemonic");
    const seed = mnemonicToSeed(phrase, pass);
    setVal("bip39-seed", mnemonicToSeedHex(phrase, pass));
    const root = fromSeed(seed);
    setVal("bip39-root-xprv", toBase58(root, { private: true }));
    setVal("bip39-root-xpub", toBase58(neuter(root), { private: false }));

    const pathBase = $("bip39-path")?.value?.trim() || "m/44'/0'/0'/0";
    const start = Math.max(0, parseInt($("bip39-start")?.value || "0", 10) || 0);
    const count = Math.min(50, Math.max(1, parseInt($("bip39-count")?.value || "5", 10) || 5));

    let accountNode = root;
    // account xprv at path without last /i — use pathBase as change-level
    try {
      accountNode = derivePath(root, pathBase);
      setVal("bip39-acct-xprv", toBase58(accountNode, { private: true }));
      setVal("bip39-acct-xpub", toBase58(neuter(accountNode), { private: false }));
    } catch (e) {
      setVal("bip39-acct-xprv", "");
      setVal("bip39-acct-xpub", "");
      throw e;
    }

    const body = $("bip39-table-body");
    body.innerHTML = "";
    for (let i = 0; i < count; i++) {
      const idx = start + i;
      const child = deriveChild(accountNode, idx);
      const d = nodeToDerived(child);
      const path = `${pathBase}/${idx}`;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="mono">${path}</td>
        <td class="mono">${d.btc_p2wpkh || d.btc_p2pkh_compressed}</td>
        <td class="mono der-cell-full">${d.pubkey_compressed}</td>
        <td class="mono der-cell-full">${d.wif_compressed}</td>
        <td><button type="button" class="ghost sm" data-eqir="${d.priv_hex}">→ EQIR</button></td>`;
      body.appendChild(tr);
    }
    body.querySelectorAll("[data-eqir]").forEach((btn) => {
      btn.addEventListener("click", () => sendToEqir(btn.dataset.eqir, "btc", "bip39"));
    });
    if (status) status.textContent = `OK · ${normalizeMnemonic(phrase).length} words · ${count} addresses`;
    flash("BIP39 derivation updated.", "ok", "bip39");
  } catch (e) {
    if (status) status.textContent = e.message || String(e);
    flash(e.message || String(e), "warn", "bip39");
  }
}

function syncBip32SourceUi() {
  const src = $("bip32-source")?.value || "xkey";
  const xkeyBox = $("bip32-source-xkey");
  const passBox = $("bip32-source-pass");
  if (xkeyBox) xkeyBox.hidden = src !== "xkey";
  if (passBox) passBox.hidden = src !== "passphrase";
}

/** bip32.org-style: SHA-256 repeated `rounds` times over passphrase[+salt]. */
function stretchPassphraseSha256(pass, salt, rounds) {
  const enc = new TextEncoder();
  let buf = enc.encode(String(pass ?? "") + String(salt ?? ""));
  const n = Math.max(1, Math.min(500_000, rounds | 0));
  for (let i = 0; i < n; i++) buf = sha256(buf);
  return buf; // 32 bytes — valid BIP32 seed length
}

function stretchPassphrasePbkdf2(pass, salt, rounds) {
  const enc = new TextEncoder();
  const n = Math.max(1, Math.min(500_000, rounds | 0));
  return pbkdf2HmacSha512(
    enc.encode(String(pass ?? "")),
    enc.encode(String(salt ?? "") || "bip32"),
    n,
    64
  );
}

function masterFromPassphrase() {
  const pass = $("bip32-pass")?.value ?? "";
  if (!pass) throw new Error("enter a passphrase");
  const salt = $("bip32-pass-salt")?.value ?? "";
  const rounds = parseInt($("bip32-pass-rounds")?.value || "50000", 10) || 50000;
  const stretch = $("bip32-pass-stretch")?.value || "sha256x";
  const seed =
    stretch === "pbkdf2"
      ? stretchPassphrasePbkdf2(pass, salt, rounds)
      : stretchPassphraseSha256(pass, salt, rounds);
  const root = fromSeed(seed);
  const xprv = toBase58(root, { private: true });
  setVal("bip32-pass-seed", bytesToHex(seed));
  setVal("bip32-pass-xprv", xprv);
  // keep xkey in sync so path derivation reuses the same pipeline
  setVal("bip32-xkey", xprv);
  return root;
}

function resolveBip32Root() {
  const src = $("bip32-source")?.value || "xkey";
  if (src === "passphrase") {
    // Use cached master from explicit Derive (50k SHA rounds — avoid rehash on every keystroke)
    const cached = $("bip32-pass-xprv")?.value?.trim();
    if (!cached) throw new Error("derive master from passphrase first");
    return fromBase58(cached);
  }
  const xkey = $("bip32-xkey")?.value?.trim() || "";
  if (!xkey) throw new Error("paste an xprv / xpub");
  return fromBase58(xkey);
}

function refreshBip32() {
  const status = $("bip32-status");
  try {
    let node = resolveBip32Root();
    const path = $("bip32-path")?.value?.trim() || "m";
    const mode = $("bip32-mode")?.value || "path";
    if (mode === "ki") {
      const k = parseInt($("bip32-account")?.value || "0", 10) || 0;
      const i = parseInt($("bip32-index")?.value || "0", 10) || 0;
      const hardK = $("bip32-account-hard")?.checked;
      node = resolveBip32Root();
      node = deriveChild(node, hardK ? (k + HARDENED) >>> 0 : k >>> 0);
      node = deriveChild(node, 0); // change external like classic bip32.org m/k'/0/i
      node = deriveChild(node, i >>> 0);
      setVal("bip32-path-out", `m/${hardK ? k + "'" : k}/0/${i}`);
    } else {
      if (path && path !== "m" && path !== "M") node = derivePath(node, path);
      setVal("bip32-path-out", path);
    }

    const info = nodeInfo(node);
    setVal(
      "bip32-info",
      [
        `source: ${$("bip32-source")?.value || "xkey"}`,
        `version: ${info.version}`,
        `depth: ${info.depth}`,
        `parent fingerprint: ${info.parentFingerprint}`,
        `child index: ${info.indexDisplay}`,
        `chain code: ${info.chainCode}`,
        `key: ${info.key}`,
        info.xprv ? `xprv: ${info.xprv}` : "",
        `xpub: ${info.xpub}`,
      ]
        .filter(Boolean)
        .join("\n")
    );
    const d = nodeToDerived(node);
    setVal("bip32-wif", d.wif_compressed);
    setVal("bip32-pub", d.pubkey_compressed);
    setVal("bip32-addr", d.btc_p2wpkh || d.btc_p2pkh_compressed);
    setVal("bip32-eth", d.eth_address);
    $("btn-bip32-eqir").dataset.priv = d.priv_hex || "";
    if (status) {
      status.textContent = d.priv_hex ? "private node" : "public node (no WIF)";
    }
    flash("BIP32 derivation updated.", "ok", "bip32");
  } catch (e) {
    if (!(e.message || "").includes("paste") && !(e.message || "").includes("enter a passphrase")) {
      flash(e.message || String(e), "warn", "bip32");
    }
    if (status) status.textContent = e.message || String(e);
  }
}

function wireBip39() {
  $("btn-bip39-generate")?.addEventListener("click", () => {
    const words = parseInt($("bip39-strength")?.value || "12", 10) || 12;
    const strength = { 12: 128, 15: 160, 18: 192, 21: 224, 24: 256 }[words] || 128;
    setVal("bip39-phrase", generateMnemonic(strength));
    refreshBip39();
  });
  ["bip39-phrase", "bip39-pass", "bip39-path", "bip39-start", "bip39-count"].forEach((id) => {
    $(id)?.addEventListener("input", () => refreshBip39());
    $(id)?.addEventListener("change", () => refreshBip39());
  });
  document.querySelectorAll("[data-bip39-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setVal("bip39-path", btn.dataset.bip39Preset);
      refreshBip39();
    });
  });
  $("btn-bip39-to-bip32")?.addEventListener("click", () => {
    const xprv = $("bip39-root-xprv")?.value;
    if (!xprv) {
      flash("Generate / enter a mnemonic first.", "warn", "bip39");
      return;
    }
    setVal("bip32-xkey", xprv);
    if (typeof window.__tbmShowPage === "function") window.__tbmShowPage("bip32");
    else location.hash = "#bip32";
    refreshBip32();
  });
}

function wireBip32() {
  $("bip32-source")?.addEventListener("change", () => {
    syncBip32SourceUi();
    refreshBip32();
  });
  syncBip32SourceUi();

  ["bip32-xkey", "bip32-path", "bip32-account", "bip32-index", "bip32-mode"].forEach((id) => {
    $(id)?.addEventListener("input", () => refreshBip32());
    $(id)?.addEventListener("change", () => refreshBip32());
  });
  $("bip32-account-hard")?.addEventListener("change", () => refreshBip32());
  // passphrase fields: clear cache on edit; derive only via button (expensive stretch)
  ["bip32-pass", "bip32-pass-salt", "bip32-pass-rounds", "bip32-pass-stretch"].forEach((id) => {
    $(id)?.addEventListener("input", () => {
      setVal("bip32-pass-seed", "");
      setVal("bip32-pass-xprv", "");
    });
  });
  $("btn-bip32-from-pass")?.addEventListener("click", () => {
    try {
      const status = $("bip32-status");
      if (status) status.textContent = "stretching passphrase…";
      // yield so UI can paint before heavy loop
      setTimeout(() => {
        try {
          masterFromPassphrase();
          refreshBip32();
          flash("Master xprv derived from passphrase.", "ok", "bip32");
        } catch (e) {
          flash(e.message || String(e), "warn", "bip32");
        }
      }, 20);
    } catch (e) {
      flash(e.message || String(e), "warn", "bip32");
    }
  });
  $("btn-bip32-eqir")?.addEventListener("click", () => {
    sendToEqir($("btn-bip32-eqir")?.dataset.priv || "", "btc", "bip32");
  });
  $("btn-bip32-eqir-eth")?.addEventListener("click", () => {
    sendToEqir($("btn-bip32-eqir")?.dataset.priv || "", "evm", "bip32");
  });
}

export function initHdUi() {
  if (!$("bip39-phrase") && !$("bip32-xkey")) return;
  wireBip39();
  wireBip32();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initHdUi);
} else {
  initHdUi();
}
