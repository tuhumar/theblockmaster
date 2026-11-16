/**
 * EQIR module shell — tabs + Kangaroo / XOR / QI / Compare panels.
 */
import { statesFromChain, exportStatesJSON } from "./core/state.js";
import { kangarooSolve, kangarooSelftest } from "./engines/kangaroo.js";
import {
  xorScalars,
  xorBits,
  hammingHex,
  xorFingerprintCloud,
} from "./engines/xor-lab.js";
import { qiWalk, qiVsDeterministic } from "./engines/qi-walk.js";
import { compareTrajectories, metricsTable } from "./engines/comparator.js";
import { G, scalarMulFast, decompress } from "./core/point.js";
import { hexToBig } from "./core/modular.js";

let getChainCtx = () => ({ chain: [], lastForward: null });

export function setChainContextProvider(fn) {
  getChainCtx = fn;
}

const CHAINS = ["btc", "evm"];
const CHAIN_HINT = {
  btc: "Bitcoin — WIF, hash160, P2PKH / P2SH / P2WPKH / Taproot",
  evm: "Ethereum + BNB Smart Chain — same 0x key, dual explorers",
};
const CHAIN_TITLE = {
  btc: "Derived · BTC",
  evm: "Derived · ETH / BSC",
};

let currentChain = "btc";

export function getEqirChain() {
  return currentChain;
}

function applyDerivedPanes() {
  const simple = (document.body.dataset.eqirMode || currentMode) === "simple";
  const title = document.getElementById("derived-title");
  const hint = document.getElementById("eqir-chain-hint");

  if (simple) {
    document.querySelectorAll("[data-chain-pane]").forEach((pane) => {
      pane.hidden = false;
    });
    if (title) title.textContent = "Derived · BTC + ETH / BSC";
    if (hint) {
      hint.textContent =
        "Same secp256k1 key → Bitcoin addresses + ETH/BSC 0x (shown together)";
    }
    return;
  }

  document.querySelectorAll("[data-chain-pane]").forEach((pane) => {
    pane.hidden = pane.dataset.chainPane !== currentChain;
  });
  if (title) title.textContent = CHAIN_TITLE[currentChain] || "Derived";
  if (hint) hint.textContent = CHAIN_HINT[currentChain] || "";
}

export function setEqirChain(id, { syncHash = true } = {}) {
  const chain = CHAINS.includes(id) ? id : "btc";
  currentChain = chain;
  document.body.dataset.eqirChain = chain;

  document.querySelectorAll("#eqir-chain-nav [data-chain]").forEach((b) => {
    b.classList.toggle("active", b.dataset.chain === chain);
  });
  applyDerivedPanes();

  try {
    localStorage.setItem("tbm-eqir-chain", chain);
  } catch {
    /* ignore */
  }

  if (syncHash) {
    try {
      const page = document.body.dataset.tbmPage || "lab";
      if (page === "lab") {
        const mode = document.body.dataset.eqirMode || "advanced";
        if (mode === "simple") {
          history.replaceState(null, "", "#lab/simple");
        } else {
          history.replaceState(
            null,
            "",
            `#lab/${chain === "evm" ? "eth" : "btc"}`
          );
        }
      }
    } catch {
      /* ignore */
    }
  }

  document.dispatchEvent(
    new CustomEvent("eqir:chain", { detail: { chain } })
  );
}

function bootChainFromHashOrStorage() {
  const raw = (location.hash || "").replace(/^#/, "");
  const parts = raw.split("/").filter(Boolean);
  let chain = null;
  if (parts[0] === "lab" && parts[1]) {
    const c = parts[1].toLowerCase();
    if (c === "btc") chain = "btc";
    if (c === "eth" || c === "evm" || c === "bsc") chain = "evm";
  }
  if (!chain) {
    try {
      const saved = localStorage.getItem("tbm-eqir-chain");
      if (CHAINS.includes(saved)) chain = saved;
    } catch {
      /* ignore */
    }
  }
  setEqirChain(chain || "btc", { syncHash: false });
}

const MODES = ["simple", "advanced"];
let currentMode = "advanced";

export function getEqirMode() {
  return currentMode;
}

export function setEqirMode(mode, { persist = true } = {}) {
  const m = MODES.includes(mode) ? mode : "advanced";
  currentMode = m;
  document.body.dataset.eqirMode = m;
  const lab = document.getElementById("page-lab");
  if (lab) lab.dataset.eqirMode = m;

  document.querySelectorAll("#eqir-mode-nav [data-eqir-mode]").forEach((b) => {
    b.classList.toggle("active", b.dataset.eqirMode === m);
  });

  const lead = document.getElementById("eqir-lab-lead");
  if (lead) {
    lead.textContent =
      m === "simple"
        ? "Simple · private key → BTC + ETH/BSC addresses · 100% local."
        : "Shared STATE engine · Double-and-Add · Kangaroo · XOR · QI · Comparator · 100% local.";
  }

  const fwd = document.getElementById("btn-fwd");
  if (fwd) {
    fwd.textContent =
      m === "simple"
        ? fwd.dataset.labelSimple || "Derive"
        : fwd.dataset.labelAdvanced || "Priv → Pub + chain";
  }

  if (m === "simple") {
    activateModule("scalar");
  }
  applyDerivedPanes();

  if (persist) {
    try {
      localStorage.setItem("tbm-eqir-mode", m);
    } catch {
      /* ignore */
    }
    try {
      const page = document.body.dataset.tbmPage || "lab";
      if (page === "lab") {
        if (m === "simple") {
          history.replaceState(null, "", "#lab/simple");
        } else {
          const chain = document.body.dataset.eqirChain || "btc";
          history.replaceState(
            null,
            "",
            `#lab/${chain === "evm" ? "eth" : "btc"}`
          );
        }
      }
    } catch {
      /* ignore */
    }
  }

  document.dispatchEvent(new CustomEvent("eqir:mode", { detail: { mode: m } }));
}

function bootModeFromStorage() {
  let mode = "advanced";
  try {
    const saved = localStorage.getItem("tbm-eqir-mode");
    if (MODES.includes(saved)) mode = saved;
  } catch {
    /* ignore */
  }
  // hash #lab/simple | #lab/btc/simple | #lab/eth/simple
  const raw = (location.hash || "").replace(/^#/, "");
  const parts = raw.split("/").filter(Boolean);
  if (parts[0] === "lab" && parts[1] === "simple") mode = "simple";
  if (parts[0] === "lab" && parts[1] === "advanced") mode = "advanced";
  if (parts[0] === "lab" && parts[2] === "simple") mode = "simple";
  if (parts[0] === "lab" && parts[2] === "advanced") mode = "advanced";
  setEqirMode(mode, { persist: false });
}

export function initEqirModules() {
  const nav = document.getElementById("eqir-mod-nav");
  if (!nav) return;

  nav.querySelectorAll("[data-mod]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.mod;
      activateModule(id);
    });
  });

  document.querySelectorAll("#eqir-mode-nav [data-eqir-mode]").forEach((btn) => {
    btn.addEventListener("click", () => setEqirMode(btn.dataset.eqirMode));
  });

  const chainNav = document.getElementById("eqir-chain-nav");
  chainNav?.querySelectorAll("[data-chain]").forEach((btn) => {
    btn.addEventListener("click", () => setEqirChain(btn.dataset.chain));
  });
  bootChainFromHashOrStorage();
  bootModeFromStorage();

  wireKangaroo();
  wireXor();
  wireQi();
  wireCompare();
  wireStateExport();

  activateModule("scalar");
}

function activateModule(id) {
  document.querySelectorAll("#eqir-mod-nav [data-mod]").forEach((b) => {
    b.classList.toggle("active", b.dataset.mod === id);
  });
  document.querySelectorAll(".eqir-panel").forEach((p) => {
    const show =
      p.id === `panel-${id}` ||
      // curve + reverse reuse scalar panel
      ((id === "curve" || id === "reverse") && p.id === "panel-scalar");
    p.hidden = !show;
  });
  const hint = document.getElementById("eqir-mod-hint");
  if (hint) {
    const map = {
      curve: "Curve Explorer — SPEC secp256k1 below in the Scalar panel.",
      scalar: "Scalar Explorer — Double-and-Add + derived.",
      reverse: "Reverse Explorer — use ↑ Half / Half(R−G) on the chain.",
      kangaroo: "Kangaroo Lab — tame/wild trajectories + STATE trail.",
      xor: "XOR Lab — reversible transforms + fingerprints.",
      qi: "Quantum-Inspired — simulated amplitudes (classical).",
      compare: "Comparator — side-by-side metrics on the same [lo,hi].",
    };
    hint.textContent = map[id] || "";
  }
  if (id === "curve") {
    document.getElementById("spec-panel")?.scrollIntoView({ behavior: "smooth" });
  }
}

function el(id) {
  return document.getElementById(id);
}

function setPre(id, text, ok = true) {
  const p = el(id);
  if (!p) return;
  p.textContent = text;
  p.classList.toggle("tool-err", !ok);
  p.classList.toggle("tool-ok", ok);
}

function wireStateExport() {
  el("btn-export-states")?.addEventListener("click", () => {
    const { chain, lastForward } = getChainCtx();
    const states = statesFromChain(chain, lastForward);
    const json = exportStatesJSON(states, {
      source: "scalar-chain",
      n: states.length,
    });
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "eqir-states.json";
    a.click();
    URL.revokeObjectURL(a.href);
    setPre("eqir-states-preview", json.slice(0, 1200) + (json.length > 1200 ? "\n…" : ""));
  });
}

function wireKangaroo() {
  el("btn-kang-selftest")?.addEventListener("click", () => {
    try {
      const bits = Math.min(20, Math.max(8, Number(el("kang-bits")?.value || 14)));
      const r = kangarooSelftest(bits, 28);
      setPre(
        "kang-out",
        [
          `bits=${r.bits} ok=${r.ok}`,
          `expected=${r.expected.toString(16)}`,
          `found=${r.stats.k}`,
          `steps=${r.stats.steps} ms=${r.stats.ms.toFixed(1)}`,
          `dps=${r.stats.dps} collisions=${r.stats.collisions}`,
          `trailStates=${r.trail.length}`,
        ].join("\n"),
        r.ok
      );
      renderTrail("kang-trail", r.trail);
    } catch (e) {
      setPre("kang-out", e.message || String(e), false);
    }
  });

  el("btn-kang-run")?.addEventListener("click", () => {
    try {
      const lo = hexToBig(el("kang-lo")?.value || "0");
      const hi = hexToBig(el("kang-hi")?.value || "0");
      const kHex = (el("kang-k")?.value || "").trim();
      if (!kHex) throw new Error("enter hidden k (hex) to build Q=kG");
      const k = hexToBig(kHex);
      if (k < lo || k > hi) throw new Error("k out of [lo,hi]");
      const Q = scalarMulFast(k, G());
      const r = kangarooSolve({ Q, lo, hi, maxFactor: 25, trailLimit: 120 });
      setPre(
        "kang-out",
        [
          `success=${r.stats.success}`,
          `k_found=${r.stats.k}`,
          `steps=${r.stats.steps} ms=${r.stats.ms.toFixed(1)}`,
          `adds=${r.stats.adds} jumps=${r.stats.jumps}`,
        ].join("\n"),
        r.stats.success
      );
      renderTrail("kang-trail", r.trail);
    } catch (e) {
      setPre("kang-out", e.message || String(e), false);
    }
  });
}

function renderTrail(boxId, trail) {
  const box = el(boxId);
  if (!box) return;
  box.innerHTML = "";
  for (const st of trail || []) {
    const d = document.createElement("div");
    d.className = "eqir-trail-card";
    const herd = st.kangaroo?.herd || "?";
    d.innerHTML = `<b>${herd}</b> <span class="mono">${(st.compressed || "").slice(0, 18)}…</span>
      <div class="muted">fp=${st.fingerprint} dist=${st.kangaroo?.dist || ""} j=${st.kangaroo?.jumpIdx ?? ""}</div>`;
    box.appendChild(d);
  }
}

function wireXor() {
  el("btn-xor-run")?.addEventListener("click", () => {
    try {
      const r = xorScalars(el("xor-a")?.value, el("xor-m")?.value);
      setPre(
        "xor-out",
        `before=${r.before}\nmask=${r.mask}\nafter=${r.after}\nrev=yes\ndec ${r.beforeDec} → ${r.afterDec}`,
        true
      );
    } catch (e) {
      setPre("xor-out", e.message || String(e), false);
    }
  });
  el("btn-xor-bits")?.addEventListener("click", () => {
    try {
      const r = xorBits(el("xor-bits")?.value, el("xor-bitmask")?.value);
      setPre("xor-out", `bits ${r.before}\nmask ${r.mask}\nout  ${r.after}`, true);
    } catch (e) {
      setPre("xor-out", e.message || String(e), false);
    }
  });
  el("btn-xor-ham")?.addEventListener("click", () => {
    try {
      const d = hammingHex(el("xor-a")?.value, el("xor-m")?.value);
      setPre("xor-out", `hamming(a,mask)=${d}`, true);
    } catch (e) {
      setPre("xor-out", e.message || String(e), false);
    }
  });
  el("btn-xor-cloud")?.addEventListener("click", () => {
    try {
      const { chain } = getChainCtx();
      const scalars = (chain || [])
        .map((r) => r.x || r.compressed)
        .filter(Boolean)
        .slice(0, 64);
      if (!scalars.length) throw new Error("Scalar chain empty — run Priv→Pub first");
      const cloud = xorFingerprintCloud(scalars, el("xor-m")?.value || "ff");
      setPre(
        "xor-out",
        `n=${cloud.rows.length} uniqueFp=${cloud.uniqueFingerprints} collisions=${cloud.collisions}`,
        true
      );
    } catch (e) {
      setPre("xor-out", e.message || String(e), false);
    }
  });
}

function wireQi() {
  el("btn-qi-run")?.addEventListener("click", () => {
    try {
      const steps = Math.min(64, Math.max(4, Number(el("qi-steps")?.value || 32)));
      const bits = Math.min(20, Math.max(8, Number(el("qi-bits")?.value || 14)));
      const width = 1n << BigInt(bits - 1);
      const start = G();
      const r = qiWalk({ startPoint: start, width, steps, seed: 3 });
      setPre(
        "qi-out",
        [
          `steps=${r.steps} nj=${r.nj}`,
          `entropy=${r.entropy.toFixed(4)} bits`,
          `ms=${r.ms.toFixed(1)}`,
          `final=${r.finalCompressed}`,
          `measured=` + r.measured.slice(0, 24).join(",") + (r.measured.length > 24 ? "…" : ""),
        ].join("\n"),
        true
      );
      renderTrail("qi-trail", r.path.slice(0, 40));
    } catch (e) {
      setPre("qi-out", e.message || String(e), false);
    }
  });
  el("btn-qi-vs")?.addEventListener("click", () => {
    try {
      const bits = Math.min(20, Math.max(8, Number(el("qi-bits")?.value || 14)));
      const width = 1n << BigInt(bits - 1);
      const r = qiVsDeterministic({
        startPoint: G(),
        width,
        steps: Number(el("qi-steps")?.value || 32),
      });
      setPre(
        "qi-out",
        `distDet=${r.distDet}\ndistQi=${r.distQi}\nentropy=${r.entropy.toFixed(4)}\nsameEndpoint=${r.sameEndpoint}`,
        true
      );
    } catch (e) {
      setPre("qi-out", e.message || String(e), false);
    }
  });
}

function wireCompare() {
  el("btn-compare-run")?.addEventListener("click", () => {
    try {
      const bits = Math.min(16, Math.max(10, Number(el("cmp-bits")?.value || 12)));
      const res = compareTrajectories({ bits, mask: el("cmp-mask")?.value || "a5a5" });
      const tab = metricsTable(res);
      const lines = [
        `bits=${tab.bits} expected_k=${tab.expected}`,
        tab.header.join("\t"),
        ...tab.rows.map((r) => r.join("\t")),
      ];
      setPre("cmp-out", lines.join("\n"), true);
      const box = el("cmp-cards");
      if (box) {
        box.innerHTML = "";
        for (const r of res.results) {
          const d = document.createElement("div");
          d.className =
            "eqir-cmp-card" + (r.success ? " ok" : " fail");
          d.innerHTML = `<b>${r.name}</b>
            <div>${r.success ? "OK" : "miss"} · ${r.ms?.toFixed?.(1) ?? r.ms} ms</div>
            <div class="muted">ops=${r.opsEcc} jumps=${r.jumps} coll=${r.collisions}</div>
            <div class="muted">mem≈${r.memoryBytes}B · ${r.notes || ""}</div>`;
          box.appendChild(d);
        }
      }
    } catch (e) {
      setPre("cmp-out", e.message || String(e), false);
    }
  });
}

/** Refresh STATE preview from chain (called by app.js). */
export function refreshStatePreview(chain, lastForward) {
  const states = statesFromChain(chain, lastForward);
  const pre = el("eqir-states-preview");
  if (!pre) return;
  pre.textContent = exportStatesJSON(states.slice(0, 8), {
    preview: true,
    total: states.length,
  }).slice(0, 1500);
}
