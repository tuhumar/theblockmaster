/**
 * TheBlockMaster — Home / EQIR / BIP39 / BIP32 / Brainwallet / Calculators / Docs
 */
const PAGES = [
  "home",
  "lab",
  "bip39",
  "bip32",
  "brainwallet",
  "calculators",
  "xmr",
  "docs",
];

function parseHash() {
  const raw = (location.hash || "").replace(/^#/, "");
  const parts = raw.split("/").filter(Boolean);
  // legacy #bip / #bip/bip39 / #bip/bip32
  if (parts[0] === "bip") {
    const sub = (parts[1] || "bip39").toLowerCase();
    return {
      page: sub === "bip32" ? "bip32" : "bip39",
      chain: null,
    };
  }
  // in-docs anchors (#doc-agents, …) stay on Docs
  if ((parts[0] || "").startsWith("doc-")) {
    return { page: "docs", chain: null, docsAnchor: parts[0] };
  }
  const page = PAGES.includes(parts[0]) ? parts[0] : null;
  let chain = null;
  let eqirMode = null;
  if (page === "lab" && parts[1]) {
    const c = parts[1].toLowerCase();
    if (c === "simple" || c === "advanced") {
      eqirMode = c;
    } else {
      if (c === "btc") chain = "btc";
      if (c === "eth" || c === "evm" || c === "bsc") chain = "evm";
    }
  }
  if (page === "lab" && parts[2]) {
    const m = parts[2].toLowerCase();
    if (m === "simple" || m === "advanced") eqirMode = m;
  }
  return { page, chain, docsAnchor: null, eqirMode };
}

function showPage(id, { chain, replace = true, docsAnchor = null, eqirMode = null } = {}) {
  let page = id;
  if (page === "bip") page = "bip39";
  page = PAGES.includes(page) ? page : "lab";

  document.querySelectorAll(".tbm-page").forEach((el) => {
    el.classList.toggle("active", el.dataset.page === page);
  });
  document.querySelectorAll(".tbm-site-tabs button[data-page]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.page === page);
  });
  document.body.dataset.tbmPage = page;

  if (page === "lab" && chain && typeof window.__eqirSetChain === "function") {
    window.__eqirSetChain(chain, { syncHash: false });
  }
  if (page === "lab" && eqirMode && typeof window.__eqirSetMode === "function") {
    window.__eqirSetMode(eqirMode);
  }

  if (page === "docs" && docsAnchor) {
    requestAnimationFrame(() => {
      document.getElementById(docsAnchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  try {
    // preserve in-docs anchors; don't overwrite with bare #docs
    if (docsAnchor) {
      const hash = `#${docsAnchor}`;
      if (replace) history.replaceState(null, "", hash);
      else history.pushState(null, "", hash);
      return;
    }
    let hash = `#${page}`;
    if (page === "lab") {
      const mode =
        eqirMode ||
        document.body.dataset.eqirMode ||
        localStorage.getItem("tbm-eqir-mode") ||
        "advanced";
      if (mode === "simple") {
        hash = "#lab/simple";
      } else {
        const c =
          chain ||
          document.body.dataset.eqirChain ||
          localStorage.getItem("tbm-eqir-chain") ||
          "btc";
        hash = `#lab/${c === "evm" ? "eth" : "btc"}`;
      }
    }
    if (replace) history.replaceState(null, "", hash);
    else history.pushState(null, "", hash);
  } catch {
    /* ignore */
  }
}

window.__tbmShowPage = showPage;

const NAV_KEYWORDS = {
  home: { target: "nav", page: "home" },
  lab: { target: "nav", page: "lab", eqirMode: "advanced" },
  eqir: { target: "nav", page: "lab", eqirMode: "advanced" },
  simple: { target: "nav", page: "lab", eqirMode: "simple" },
  advanced: { target: "nav", page: "lab", eqirMode: "advanced" },
  bip39: { target: "nav", page: "bip39" },
  mnemonic: { target: "nav", page: "bip39" },
  seed: { target: "nav", page: "bip39" },
  bip32: { target: "nav", page: "bip32" },
  hd: { target: "nav", page: "bip32" },
  xprv: { target: "nav", page: "bip32" },
  xpub: { target: "nav", page: "bip32" },
  brainwallet: { target: "nav", page: "brainwallet" },
  brain: { target: "nav", page: "brainwallet" },
  vanity: { target: "nav", page: "brainwallet" },
  calculators: { target: "nav", page: "calculators" },
  calculator: { target: "nav", page: "calculators" },
  calc: { target: "nav", page: "calculators" },
  hash: { target: "nav", page: "calculators" },
  xmr: { target: "nav", page: "xmr" },
  monero: { target: "nav", page: "xmr" },
  docs: { target: "nav", page: "docs" },
  doc: { target: "nav", page: "docs" },
};

function setField(id, value, { event = "input" } = {}) {
  const el = document.getElementById(id);
  if (!el) return null;
  el.value = value == null ? "" : String(value);
  if (event) el.dispatchEvent(new Event(event, { bubbles: true }));
  return el;
}

function afterPaint(fn) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

function runLabPriv(hex, { chain = "btc", mode = "simple" } = {}) {
  const c = chain === "evm" ? "evm" : "btc";
  showPage("lab", { chain: c, eqirMode: mode });
  afterPaint(() => {
    if (typeof window.__eqirSetMode === "function") window.__eqirSetMode(mode);
    if (typeof window.__eqirSetChain === "function") {
      window.__eqirSetChain(c, { syncHash: false });
    }
    const priv = setField("priv", hex);
    if (priv) priv.focus();
    const fwd = document.getElementById("btn-fwd");
    if (fwd) fwd.click();
    else {
      priv?.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
}

function runLabPub(hex) {
  showPage("lab", { chain: "btc", eqirMode: "advanced" });
  afterPaint(() => {
    if (typeof window.__eqirSetMode === "function") window.__eqirSetMode("advanced");
    const pub = setField("pub", hex);
    if (pub) pub.focus();
  });
}

function runLabAddr(addr, chain) {
  const c = chain === "evm" ? "evm" : "btc";
  showPage("lab", { chain: c, eqirMode: "simple" });
  afterPaint(() => {
    if (typeof window.__eqirSetMode === "function") window.__eqirSetMode("simple");
    if (typeof window.__eqirSetChain === "function") {
      window.__eqirSetChain(c, { syncHash: false });
    }
    const st = document.getElementById("derived-status");
    if (st) st.textContent = `address · ${addr}`;
    // also drop into calculators Base58 / hex for inspect
    if (c === "btc") {
      setField("calc-b58-in", addr, { event: null });
    } else {
      setField("calc-hex-in", addr, { event: null });
    }
    try {
      sessionStorage.setItem("tbm-lookup-addr", JSON.stringify({ addr, chain: c }));
    } catch {
      /* ignore */
    }
  });
}

/**
 * Classify Home search into a route.
 * Order: keywords → mnemonic → HD keys → WIF → pub → addresses → hex priv → brainwallet text.
 */
function classifyQuery(raw) {
  const q = String(raw || "").trim();
  if (!q) return null;

  const compact = q.replace(/\s+/g, "");
  const lower = compact.toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const keyword = NAV_KEYWORDS[q.toLowerCase()] || NAV_KEYWORDS[lower];
  if (keyword && words.length === 1) return { ...keyword, value: q };

  // BIP39 mnemonic (12 / 15 / 18 / 21 / 24)
  if ([12, 15, 18, 21, 24].includes(words.length) && words.every((w) => /^[a-zA-Z]+$/.test(w))) {
    return { target: "mnemonic", value: words.join(" ").toLowerCase() };
  }

  // Extended keys (xprv/xpub/ypub/zpub/vprv…)
  if (/^[xyzuv](prv|pub)[1-9A-HJ-NP-Za-km-z]{20,}$/i.test(compact)) {
    return { target: "xkey", value: compact };
  }

  // WIF (mainnet uncompressed 5… / compressed K or L…)
  if (/^[5KL][1-9A-HJ-NP-Za-km-z]{50,52}$/.test(compact)) {
    return { target: "wif", value: compact };
  }

  // secp256k1 public keys
  if (/^(02|03)[0-9a-fA-F]{64}$/.test(compact) || /^04[0-9a-fA-F]{128}$/.test(compact)) {
    return { target: "pub", value: lower, chain: "btc" };
  }

  // BTC addresses
  if (/^(bc1)[a-z0-9]{25,87}$/i.test(compact) || /^[13][a-km-zA-HJ-NP-Z1-9]{24,42}$/.test(compact)) {
    return { target: "addr", value: compact, chain: "btc" };
  }

  // ETH / BSC (0x + 40 hex). Bare 40-hex is ambiguous with priv — treat as EVM addr only with 0x.
  if (/^0x[0-9a-fA-F]{40}$/.test(compact)) {
    return { target: "addr", value: "0x" + compact.slice(2).toLowerCase(), chain: "evm" };
  }

  // Monero standard / integrated-ish (long base58, typically starts with 4)
  if (/^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{90,110}$/.test(compact) && /^[48]/.test(compact)) {
    return { target: "xmr_addr", value: compact };
  }

  // Hex private key (optional 0x, 1–64 nybbles). Prefer when clearly hex.
  if (/^(0x)?[0-9a-fA-F]{1,64}$/.test(compact)) {
    return {
      target: "priv",
      value: lower.replace(/^0x/, ""),
      chain: "btc",
    };
  }

  // 64-byte hex seed → BIP39 seed display path: open BIP32 passphrase / note as hex seed on bip39
  if (/^(0x)?[0-9a-fA-F]{128}$/.test(compact)) {
    return { target: "seed_hex", value: lower.replace(/^0x/, "") };
  }

  // Free text / vanity / passphrase → Brainwallet
  return { target: "brainwallet", value: q };
}

async function applySearch(classified) {
  if (!classified) return;
  const { target, value, page, chain, eqirMode } = classified;

  if (target === "nav") {
    showPage(page, { chain: chain || null, eqirMode: eqirMode || null });
    return;
  }

  if (target === "mnemonic") {
    showPage("bip39");
    afterPaint(() => {
      const el = setField("bip39-phrase", value);
      el?.focus();
    });
    return;
  }

  if (target === "xkey") {
    showPage("bip32");
    afterPaint(() => {
      const src = document.getElementById("bip32-source");
      if (src) {
        src.value = "xkey";
        src.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const el = setField("bip32-xkey", value);
      el?.focus();
    });
    return;
  }

  if (target === "brainwallet") {
    showPage("brainwallet");
    afterPaint(() => {
      const el = setField("bw-pass", value);
      el?.focus();
    });
    return;
  }

  if (target === "xmr_addr") {
    showPage("xmr");
    afterPaint(() => {
      document.querySelector('[data-xmr-mod="address"]')?.click();
      const el = setField("xmr-addr-in", value);
      el?.focus();
      document.getElementById("btn-xmr-decode")?.click();
    });
    return;
  }

  if (target === "seed_hex") {
    showPage("bip32");
    afterPaint(() => {
      const src = document.getElementById("bip32-source");
      if (src) {
        src.value = "passphrase";
        src.dispatchEvent(new Event("change", { bubbles: true }));
      }
      setField("bip32-pass", value);
      setField("calc-hex-in", value, { event: null });
      document.getElementById("bip32-pass")?.focus();
    });
    return;
  }

  if (target === "wif") {
    try {
      const { wifDecode } = await import("./core/formats.js");
      const { privHex } = wifDecode(value);
      runLabPriv(privHex, { chain: "btc", mode: "simple" });
    } catch (e) {
      // bad WIF checksum → treat as brainwallet / show bip32? fall to calculators Base58
      showPage("calculators");
      afterPaint(() => {
        setField("calc-b58-in", value);
        document.getElementById("btn-calc-b58-dec")?.click();
      });
      console.warn("WIF decode failed", e);
    }
    return;
  }

  if (target === "pub") {
    runLabPub(value);
    return;
  }

  if (target === "addr") {
    runLabAddr(value, chain);
    return;
  }

  if (target === "priv") {
    runLabPriv(value, { chain: chain || "btc", mode: "simple" });
    return;
  }
}

function bootHomeSearch() {
  const form = document.getElementById("tbm-home-search");
  const input = document.getElementById("tbm-search-q");
  if (!form || !input) return;

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const classified = classifyQuery(input.value);
    if (!classified) {
      input.focus();
      return;
    }
    applySearch(classified).catch((err) => console.warn("search route failed", err));
  });
}

window.__tbmClassifyQuery = classifyQuery;
window.__tbmApplySearch = applySearch;

function currentTheme() {
  const t = document.documentElement.getAttribute("data-theme");
  return t === "dark" ? "dark" : "light";
}

function setTheme(theme, { persist = true } = {}) {
  const t = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", t);
  if (persist) {
    try {
      localStorage.setItem("tbm-theme", t);
    } catch {
      /* ignore */
    }
  }
  const btn = document.getElementById("tbm-theme-toggle");
  const label = btn?.querySelector(".tbm-theme-label");
  if (label) label.textContent = t === "dark" ? "Light" : "Dark";
  if (btn) {
    btn.title = t === "dark" ? "Switch to light mode" : "Switch to dark mode";
    btn.setAttribute("aria-pressed", t === "dark" ? "true" : "false");
  }
  document.dispatchEvent(new CustomEvent("tbm:theme", { detail: { theme: t } }));
  try {
    if (window.TheBlockMaster?.publish) window.TheBlockMaster.publish({ includeSecrets: true });
  } catch {
    /* ignore */
  }
}

function toggleTheme() {
  setTheme(currentTheme() === "dark" ? "light" : "dark");
}

window.__tbmSetTheme = setTheme;
window.__tbmToggleTheme = toggleTheme;

function bootSite() {
  setTheme(currentTheme(), { persist: false });
  document.getElementById("tbm-theme-toggle")?.addEventListener("click", toggleTheme);

  document.querySelectorAll(".tbm-site-tabs button[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => showPage(btn.dataset.page));
  });
  document.querySelectorAll("[data-goto]").forEach((el) => {
    el.addEventListener("click", () =>
      showPage(el.dataset.goto, { chain: el.dataset.gotoChain || null })
    );
  });

  window.addEventListener("hashchange", () => {
    const { page, chain, docsAnchor, eqirMode } = parseHash();
    if (page) showPage(page, { chain, docsAnchor, eqirMode, replace: true });
  });

  document.querySelectorAll(".tbm-docs-toc a[href^='#doc-']").forEach((a) => {
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      const id = a.getAttribute("href").replace(/^#/, "");
      showPage("docs", { docsAnchor: id, replace: false });
    });
  });

  document.querySelectorAll("[data-docs-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const name = tab.getAttribute("data-docs-tab");
      const root = tab.closest("section") || document.getElementById("doc-run");
      if (!root) return;
      root.querySelectorAll("[data-docs-tab]").forEach((t) => {
        const on = t === tab;
        t.classList.toggle("active", on);
        t.setAttribute("aria-selected", on ? "true" : "false");
      });
      root.querySelectorAll("[data-docs-panel]").forEach((p) => {
        const on = p.getAttribute("data-docs-panel") === name;
        p.classList.toggle("active", on);
        if (on) p.removeAttribute("hidden");
        else p.setAttribute("hidden", "");
      });
    });
  });

  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-copy]");
    if (!btn) return;
    const el = document.getElementById(btn.dataset.copy);
    if (!el) return;
    const v = "value" in el ? el.value : el.textContent;
    navigator.clipboard?.writeText(v || "");
  });

  bootHomeSearch();

  const { page, chain, docsAnchor, eqirMode } = parseHash();
  showPage(page || "home", { chain, docsAnchor, eqirMode });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootSite);
} else {
  bootSite();
}
