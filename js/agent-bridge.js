/**
 * TheBlockMaster agent bridge — shared STATE for AI agents & agent browsers.
 *
 * Surfaces:
 *   window.TheBlockMaster
 *   localStorage["tbm-shared-state"]
 *   BroadcastChannel("tbm-shared-state")
 *   window.postMessage({ source:"theblockmaster", … })
 *   CustomEvent("tbm:state")
 */
const STORAGE_KEY = "tbm-shared-state";
const CHANNEL = "tbm-shared-state";

function $(id) {
  return document.getElementById(id);
}

function val(id) {
  const el = $(id);
  return el && "value" in el ? String(el.value || "") : "";
}

function setVal(id, v) {
  const el = $(id);
  if (!el || v == null) return;
  el.value = String(v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function currentPage() {
  return document.body.dataset.tbmPage || "home";
}

function buildSnapshot({ includeSecrets = true } = {}) {
  const page = currentPage();
  const snap = {
    lab: "theblockmaster",
    version: 1,
    exportedAt: new Date().toISOString(),
    page,
    theme: document.documentElement.getAttribute("data-theme") || "light",
    hash: location.hash || "",
    eqirChain: document.body.dataset.eqirChain || null,
    eqirMode: document.body.dataset.eqirMode || "advanced",
    urls: {
      home: "#home",
      eqirBtc: "#lab/btc",
      eqirEth: "#lab/eth",
      bip39: "#bip39",
      bip32: "#bip32",
      brainwallet: "#brainwallet",
      calculators: "#calculators",
      xmr: "#xmr",
      docs: "#docs",
    },
    inputs: {},
    derived: {},
    notes: "Keys stay in this browser origin unless the agent reads the DOM/storage.",
  };

  const secrets = {
    priv: val("priv"),
    pub: val("pub"),
    bip39Phrase: val("bip39-phrase"),
    bip32Xkey: val("bip32-xkey"),
    bip32Pass: val("bip32-pass"),
    bwPass: val("bw-pass"),
    xmrSpend: val("xmr-spend"),
    xmrView: val("xmr-view"),
  };

  if (includeSecrets) {
    snap.inputs = { ...secrets, indices: val("indices"), maxbit: val("maxbit") };
  } else {
    snap.inputs = {
      hasPriv: !!secrets.priv,
      hasPub: !!secrets.pub,
      hasMnemonic: !!secrets.bip39Phrase,
      hasXmrSpend: !!secrets.xmrSpend,
    };
  }

  snap.derived = {
    btcP2wpkh: val("der-btc-p2wpkh"),
    btcP2pkh: val("der-btc-p2pkh-c"),
    eth: val("der-eth"),
    xmrAddress: val("xmr-address"),
    bip39Seed: includeSecrets ? val("bip39-seed") : undefined,
    bip39RootXprv: includeSecrets ? val("bip39-root-xprv") : undefined,
  };

  const preview = $("eqir-states-preview");
  if (preview?.textContent) {
    try {
      snap.eqirStatesPreview = JSON.parse(preview.textContent);
    } catch {
      snap.eqirStatesPreviewText = preview.textContent.slice(0, 4000);
    }
  }

  return snap;
}

function persist(snap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
  } catch {
    /* quota / private mode */
  }
  try {
    if (!window.__tbmBc) window.__tbmBc = new BroadcastChannel(CHANNEL);
    window.__tbmBc.postMessage({ type: "state", snapshot: snap });
  } catch {
    /* ignore */
  }
  document.dispatchEvent(new CustomEvent("tbm:state", { detail: snap }));
  try {
    window.postMessage({ source: "theblockmaster", type: "state", snapshot: snap }, "*");
  } catch {
    /* ignore */
  }
}

function applySnapshot(partial = {}) {
  if (partial.page && typeof window.__tbmShowPage === "function") {
    window.__tbmShowPage(partial.page, {
      chain: partial.eqirChain || partial.chain || null,
    });
  }
  if (partial.eqirChain && typeof window.__eqirSetChain === "function") {
    window.__eqirSetChain(partial.eqirChain, { syncHash: false });
  }
  const inp = partial.inputs || partial;
  if (inp.priv != null) setVal("priv", inp.priv);
  if (inp.pub != null) setVal("pub", inp.pub);
  if (inp.indices != null) setVal("indices", inp.indices);
  if (inp.bip39Phrase != null) setVal("bip39-phrase", inp.bip39Phrase);
  if (inp.bip32Xkey != null) setVal("bip32-xkey", inp.bip32Xkey);
  if (inp.bip32Pass != null) setVal("bip32-pass", inp.bip32Pass);
  if (inp.bwPass != null) setVal("bw-pass", inp.bwPass);
  if (inp.xmrSpend != null) setVal("xmr-spend", inp.xmrSpend);
  const snap = buildSnapshot({ includeSecrets: true });
  persist(snap);
  return snap;
}

function publish(opts) {
  const snap = buildSnapshot(opts);
  persist(snap);
  return snap;
}

const api = {
  version: 1,
  storageKey: STORAGE_KEY,
  channel: CHANNEL,
  getSnapshot: buildSnapshot,
  publish,
  applySnapshot,
  goto(page, opts = {}) {
    if (typeof window.__tbmShowPage === "function") {
      window.__tbmShowPage(page, opts);
    } else {
      location.hash = `#${page}`;
    }
    return publish();
  },
  setPriv(hex) {
    return applySnapshot({ inputs: { priv: hex } });
  },
  setPub(hex) {
    return applySnapshot({ inputs: { pub: hex } });
  },
  readStorage() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch {
      return null;
    }
  },
  subscribe(fn) {
    const handler = (ev) => fn(ev.detail);
    document.addEventListener("tbm:state", handler);
    return () => document.removeEventListener("tbm:state", handler);
  },
  setTheme(theme) {
    if (typeof window.__tbmSetTheme === "function") window.__tbmSetTheme(theme);
    return publish();
  },
  toggleTheme() {
    if (typeof window.__tbmToggleTheme === "function") window.__tbmToggleTheme();
    return publish();
  },
};

window.TheBlockMaster = api;
window.__tbmAgent = api;

function bootAgentBridge() {
  try {
    window.__tbmBc = new BroadcastChannel(CHANNEL);
    window.__tbmBc.onmessage = (ev) => {
      if (ev?.data?.type === "state" && ev.data.snapshot) {
        document.dispatchEvent(
          new CustomEvent("tbm:state", { detail: ev.data.snapshot })
        );
      }
    };
  } catch {
    /* ignore */
  }

  window.addEventListener("message", (ev) => {
    const d = ev.data;
    if (!d || d.target !== "theblockmaster") return;
    if (d.type === "getSnapshot") {
      const snap = buildSnapshot({ includeSecrets: !!d.includeSecrets });
      ev.source?.postMessage?.(
        { source: "theblockmaster", type: "snapshot", snapshot: snap, id: d.id },
        "*"
      );
    }
    if (d.type === "applySnapshot" && d.snapshot) {
      const snap = applySnapshot(d.snapshot);
      ev.source?.postMessage?.(
        { source: "theblockmaster", type: "applied", snapshot: snap, id: d.id },
        "*"
      );
    }
    if (d.type === "goto" && d.page) {
      api.goto(d.page, { chain: d.chain });
    }
  });

  // publish on navigation / chain changes
  document.addEventListener("eqir:chain", () => publish());
  const orig = window.__tbmShowPage;
  if (typeof orig === "function") {
    window.__tbmShowPage = function patchedShowPage(...args) {
      const r = orig.apply(this, args);
      setTimeout(() => publish({ includeSecrets: true }), 0);
      return r;
    };
  }

  // initial + periodic light publish (no spam: on load + visibility)
  setTimeout(() => publish({ includeSecrets: true }), 300);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) publish({ includeSecrets: true });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootAgentBridge);
} else {
  bootAgentBridge();
}
