import { forwardFromPrivate, exportJSON } from "./engines/double-add.js";
import {
  createReverseSession,
  applyReverseStep,
  undoLast,
  applyKnownSetBits,
  summarize,
} from "./engines/reverse.js";
import {
  createSeqPubSession,
  seqAcceptPub,
  seqUndo,
  seqPrivHex,
  seqStatus,
  seqStartInfinity,
  samePt,
} from "./engines/seq-pub.js";
import { verifyPath } from "./engines/puzzle-bridge.js";
import { bitGrid } from "./engines/index-explorer.js";
import {
  decompress,
  compress,
  fmtPt,
  addDetailed,
  doubleDetailed,
  halfDetailed,
  subDetailed,
  G,
  isInf,
  onCurve,
  scalarMulDetailed,
} from "./core/point.js";
import { bigToHex, hexToBig, mod } from "./core/modular.js";
import { P, N, A, B, GX, GY } from "./core/secp256k1.js";
import {
  formatAddTraceNotes,
  formatHalfTraceNotes,
  formatHalf1Notes,
  formatForwardOpNotes,
  algoForwardSpec,
  algoReverseSpec,
} from "./core/lab-notes.js";
import {
  addPin,
  renamePin,
  removePin,
  loadPins,
  loadHistory,
  analyzeRelations,
  renderPinsList,
  renderRelationsList,
  pushPrivHistory,
  clearHistory,
  removeHistoryEntry,
  renderHistoryList,
} from "./sidebars.js";
import { deriveFromPrivate, emptyDerived } from "./core/formats.js";
import {
  fetchAllAddressStats,
  getCachedStat,
} from "./core/explorer-pool.js?v=eqir1";
import { initToolsPanel } from "./tools-panel.js?v=eqir1";
import {
  initEqirModules,
  setChainContextProvider,
  refreshStatePreview,
  setEqirChain,
  setEqirMode,
} from "./eqir-modules.js?v=tbm10";

const G_COMPRESSED =
  "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

function setVal(id, v) {
  const el = $(id);
  if (el) el.value = v == null ? "" : String(v);
}

function btcExplorerUrl(addr) {
  const a = String(addr || "").trim();
  if (!a) return "#";
  return `https://mempool.space/address/${encodeURIComponent(a)}`;
}

function ethExplorerUrl(addr) {
  const a = String(addr || "").trim();
  if (!a) return "#";
  return `https://etherscan.io/address/${encodeURIComponent(a)}`;
}

function bnbExplorerUrl(addr) {
  const a = String(addr || "").trim();
  if (!a) return "#";
  return `https://bscscan.com/address/${encodeURIComponent(a)}`;
}

function setExplorerLink(linkId, url, enabled) {
  const a = $(linkId);
  if (!a) return;
  if (enabled && url && url !== "#") {
    a.href = url;
    a.classList.remove("disabled");
    a.setAttribute("aria-disabled", "false");
  } else {
    a.href = "#";
    a.classList.add("disabled");
    a.setAttribute("aria-disabled", "true");
  }
}

const DERIVED_BTC_FIELDS = [
  ["der-btc-p2pkh-c", "exp-btc-p2pkh-c", "bal-btc-p2pkh-c", "btc_p2pkh_compressed"],
  ["der-btc-p2pkh-u", "exp-btc-p2pkh-u", "bal-btc-p2pkh-u", "btc_p2pkh_uncompressed"],
  ["der-btc-p2sh", "exp-btc-p2sh", "bal-btc-p2sh", "btc_p2sh_p2wpkh"],
  ["der-btc-p2wpkh", "exp-btc-p2wpkh", "bal-btc-p2wpkh", "btc_p2wpkh"],
  ["der-btc-p2tr", "exp-btc-p2tr", "bal-btc-p2tr", "btc_p2tr"],
];

function syncDerivedExplorers(d) {
  for (const [, expId, , key] of DERIVED_BTC_FIELDS) {
    const addr = d?.[key];
    const ok = !!(addr && !String(addr).startsWith("("));
    setExplorerLink(expId, ok ? btcExplorerUrl(addr) : "#", ok);
  }
  const eth = d?.eth_address;
  setExplorerLink("exp-eth", eth ? ethExplorerUrl(eth) : "#", !!eth);
  const bnb = d?.bnb_address || eth;
  setExplorerLink("exp-bnb", bnb ? bnbExplorerUrl(bnb) : "#", !!bnb);
}

function clearBalBadges() {
  for (const [, , balId] of DERIVED_BTC_FIELDS) {
    const el = $(balId);
    if (el) el.innerHTML = "";
  }
  for (const id of ["bal-eth", "bal-bnb"]) {
    const el = $(id);
    if (el) el.innerHTML = "";
  }
}

function setBalLoading(ids) {
  for (const id of ids) {
    const el = $(id);
    if (!el) continue;
    el.innerHTML = `<span class="bb load"><span class="ico">⏳</span></span>`;
  }
}

function renderBalBadge(el, stat) {
  if (!el) return;
  if (!stat) {
    el.innerHTML = "";
    return;
  }
  if (stat.error) {
    el.innerHTML = `<span class="bb err" title="${escAttr(stat.error)}"><span class="ico">!</span></span>`;
    return;
  }
  const parts = [];
  if (stat.balance != null) {
    parts.push(
      `<span class="bb bal" title="balance ${escAttr(stat.balance)} ${escAttr(stat.balanceUnit || "")}"><span class="ico">◉</span>${escAttr(shortBal(stat.balance))}</span>`
    );
  }
  if (stat.txIn != null) {
    parts.push(
      `<span class="bb in" title="tx in / recebidas"><span class="ico">↓</span>${escAttr(stat.txIn)}</span>`
    );
  }
  if (stat.txOut != null) {
    parts.push(
      `<span class="bb out" title="tx out / enviadas"><span class="ico">↑</span>${escAttr(stat.txOut)}</span>`
    );
  }
  if (stat.txIn == null && stat.txOut == null && stat.txTotal != null) {
    parts.push(
      `<span class="bb tot" title="tx total"><span class="ico">Σ</span>${escAttr(stat.txTotal)}</span>`
    );
  }
  el.innerHTML = parts.join("") || `<span class="bb tot" title="no data">—</span>`;
}

function shortBal(s) {
  const t = String(s);
  if (t.length <= 10) return t;
  if (t.includes(".")) {
    const [a, b] = t.split(".");
    return a + "." + b.slice(0, 4);
  }
  return t.slice(0, 8) + "…";
}

function parseBalanceNum(bal) {
  if (bal == null || bal === "") return 0;
  const n = Number(String(bal).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function hideFundLeakAlert() {
  const box = $("fund-leak-alert");
  if (!box) return;
  box.hidden = true;
  box.innerHTML = "";
}

function showFundLeakAlert(hits) {
  const box = $("fund-leak-alert");
  if (!box) return;
  if (!hits.length) {
    hideFundLeakAlert();
    return;
  }
  const lis = hits
    .map(
      (h) =>
        `<li><strong>${escAttr(h.chain)}</strong> ${escAttr(h.addr)} · ${escAttr(h.balance)} ${escAttr(h.unit)}</li>`
    )
    .join("");
  box.innerHTML = `
    <div class="fla-inner">
      <div class="fla-title">⚠ leak / funded key — act now</div>
      <div class="fla-body">
        This private key controls address(es) with funds. Treat it as compromised:
        <strong>move funds immediately</strong> to a fresh wallet and
        <strong>discard this key</strong> (do not reuse, share, or leave it on screen/logs).
      </div>
      <ul class="fla-list">${lis}</ul>
    </div>`;
  box.hidden = false;
  try {
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch {
    /* ignore */
  }
}

function escAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

let balFetchSeq = 0;
let lastDerivedForBal = null;

function hideCacheNotice() {
  const n = $("bal-cache-notice");
  if (n) n.hidden = true;
}

function showCacheNotice(meta) {
  const n = $("bal-cache-notice");
  const msg = $("bal-cache-msg");
  if (!n || !msg) return;
  if (!meta?.fromCache) {
    n.hidden = true;
    return;
  }
  const when = meta.cachedAt
    ? new Date(meta.cachedAt).toLocaleString()
    : "desconhecido";
  if (meta.fromCache === "partial") {
    msg.textContent = `some balances came from local cache (${meta.cacheHits} hit(s); oldest: ${when})`;
  } else {
    msg.textContent = `result came from local cache (saved: ${when}) — no online request`;
  }
  n.hidden = false;
}

async function refreshAddressBalances(d, { forceRefresh = false } = {}) {
  const st = $("bal-status");
  lastDerivedForBal = d || null;
  if (!d) {
    clearBalBadges();
    hideFundLeakAlert();
    hideCacheNotice();
    if (st) st.textContent = "";
    return;
  }
  const btcAddrs = [];
  const mapBtc = [];
  for (const [, , balId, key] of DERIVED_BTC_FIELDS) {
    const addr = d[key];
    if (addr && !String(addr).startsWith("(")) {
      btcAddrs.push(addr);
      mapBtc.push([addr, balId, key]);
    }
  }
  const ethAddr = d.eth_address;
  const bnbAddr = d.bnb_address || ethAddr;
  const evmIds = [];
  if (ethAddr) evmIds.push("bal-eth");
  if (bnbAddr) evmIds.push("bal-bnb");
  const loadIds = mapBtc.map(([, id]) => id).concat(evmIds);
  setBalLoading(loadIds);
  hideFundLeakAlert();
  if (!forceRefresh) hideCacheNotice();
  if (st) {
    st.textContent = forceRefresh ? "fetching online…" : "fetching (cache→pool)…";
  }

  const seq = ++balFetchSeq;
  try {
    const res = await fetchAllAddressStats({
      btc: btcAddrs,
      eth: ethAddr ? [ethAddr] : [],
      bnb: bnbAddr ? [bnbAddr] : [],
      forceRefresh,
    });
    if (seq !== balFetchSeq) return; // stale

    const hits = [];
    for (const [addr, balId] of mapBtc) {
      const stat = res.btc.stats[addr];
      renderBalBadge($(balId), stat);
      if (stat && !stat.error && parseBalanceNum(stat.balance) > 0) {
        hits.push({
          chain: "BTC",
          addr,
          balance: stat.balance,
          unit: stat.balanceUnit || "BTC",
        });
      }
    }
    if (ethAddr) {
      const estat = res.eth.stats[ethAddr];
      renderBalBadge($("bal-eth"), estat);
      if (estat && !estat.error && parseBalanceNum(estat.balance) > 0) {
        hits.push({
          chain: "ETH",
          addr: ethAddr,
          balance: estat.balance,
          unit: estat.balanceUnit || "ETH",
        });
      }
    }
    if (bnbAddr) {
      const bstat = res.bnb?.stats?.[bnbAddr];
      renderBalBadge($("bal-bnb"), bstat);
      if (bstat && !bstat.error && parseBalanceNum(bstat.balance) > 0) {
        hits.push({
          chain: "BNB",
          addr: bnbAddr,
          balance: bstat.balance,
          unit: bstat.balanceUnit || "BNB",
        });
      }
    }
    showFundLeakAlert(hits);
    showCacheNotice(res.meta);
    const bp = res.meta.btcProvider || "?";
    const ep = res.meta.ethProvider || "—";
    const np = res.meta.bnbProvider || "—";
    const src =
      res.meta.fromCache === true
        ? "CACHE"
        : res.meta.fromCache === "partial"
          ? "cache+online"
          : "online";
    if (st) {
      st.textContent =
        hits.length > 0
          ? `⚠ FUNDS×${hits.length} · ${src} · BTC:${bp} · ETH:${ep} · BNB:${np}`
          : `${src} · BTC:${bp} · ETH:${ep} · BNB:${np}`;
    }
    // atualiza cor do card no histórico (se a priv estiver listada)
    try {
      const privNorm = String(d.priv_hex || $("priv")?.value || "")
        .trim()
        .toLowerCase()
        .replace(/^0x/, "")
        .replace(/^0+/, "") || "0";
      const stClass = classifyFromFetchResult(d, res);
      for (const entry of loadHistory()) {
        const v =
          String(entry.value || "")
            .trim()
            .toLowerCase()
            .replace(/^0x/, "")
            .replace(/^0+/, "") || "0";
        if (v === privNorm) {
          histStatusById[entry.id] = stClass;
          applyHistCardStatus(entry.id, stClass);
        }
      }
    } catch {
      /* ignore */
    }
  } catch (e) {
    if (seq !== balFetchSeq) return;
    hideFundLeakAlert();
    hideCacheNotice();
    for (const id of loadIds) {
      renderBalBadge($(id), { error: e.message || String(e) });
    }
    if (st) st.textContent = "pool failure: " + (e.message || e);
  }
}

function fillDerivedFromPriv(privHex) {
  const st = $("derived-status");
  const map = {
    "der-wif-c": "wif_compressed",
    "der-wif-u": "wif_uncompressed",
    "der-pub-c": "pubkey_compressed",
    "der-pub-u": "pubkey_uncompressed",
    "der-btc-p2pkh-c": "btc_p2pkh_compressed",
    "der-btc-p2pkh-u": "btc_p2pkh_uncompressed",
    "der-btc-p2sh": "btc_p2sh_p2wpkh",
    "der-btc-p2wpkh": "btc_p2wpkh",
    "der-btc-p2tr": "btc_p2tr",
    "der-eth": "eth_address",
    "der-bnb": "bnb_address",
    "der-h160-c": "hash160_compressed",
    "der-h160-u": "hash160_uncompressed",
  };
  try {
    const raw = String(privHex || "").trim();
    if (!raw) throw new Error("empty");
    const d = deriveFromPrivate(raw);
    for (const [id, key] of Object.entries(map)) setVal(id, d[key]);
    syncDerivedExplorers(d);
    if (st) st.textContent = "· ok · ↗ explorer";
    refreshAddressBalances(d);
    return d;
  } catch {
    const empty = emptyDerived();
    for (const [id, key] of Object.entries(map)) setVal(id, empty[key]);
    syncDerivedExplorers(null);
    clearBalBadges();
    hideFundLeakAlert();
    hideCacheNotice();
    if (st) st.textContent = "(no valid private)";
    const bs = $("bal-status");
    if (bs) bs.textContent = "";
    return null;
  }
}

function refreshDerived() {
  return fillDerivedFromPriv($("priv")?.value);
}

function fillCurveSpecFields() {
  setVal("spec-curve-name", "secp256k1 (SEC2 / Bitcoin)");
  setVal("spec-curve-eq", "y² = x³ + a·x + b  (mod p)");
  setVal("spec-curve-a", bigToHex(A, 1));
  setVal("spec-curve-b", bigToHex(B, 1));
  setVal("spec-curve-p", bigToHex(P));
  setVal("spec-curve-n", bigToHex(N));
  setVal("spec-curve-gx", bigToHex(GX));
  setVal("spec-curve-gy", bigToHex(GY));
  setVal("spec-curve-gc", G_COMPRESSED);
  setVal(
    "spec-motor",
    "Deterministic BigInt (js/core/*) — no AI, no network, no heuristics"
  );
}

function fillForwardSpec(priv, algo) {
  fillCurveSpecFields();
  setVal("spec-algo-name", algo?.name || "Double-and-Add MSB-first");
  setVal("spec-algo-dir", "forward");
  setVal("spec-algo-rule", algoForwardSpec().join("\n"));
  setVal(
    "spec-algo-why-d",
    algo?.whyDouble ||
      "Always — each bit requires a Double before deciding Add."
  );
  setVal(
    "spec-algo-why-a",
    algo?.whyAdd || "Only when bit[i]=1 in scalar k."
  );
  setVal("spec-k-hex", priv.hex);
  setVal("spec-k-dec", priv.dec);
  setVal("spec-k-bitlen", priv.bitLength);
  setVal("spec-k-hamming", priv.hamming);
  setVal("spec-k-bin", priv.bin);
  setVal("spec-k-indices", priv.setBitsLSB.join(","));
}

function fillReverseSpec(maxBit, qFmt, kPartialHex = "") {
  fillCurveSpecFields();
  setVal("spec-algo-name", "Reverse Double-and-Add (half / half(R−G))");
  setVal("spec-algo-dir", "reverse");
  setVal("spec-algo-rule", algoReverseSpec().join("\n"));
  setVal(
    "spec-algo-why-d",
    "bit=0 → half(R) undoes Double without Add"
  );
  setVal(
    "spec-algo-why-a",
    "bit=1 → half(R−G) undoes Add+Double"
  );
  setVal("spec-k-hex", kPartialHex || "");
  setVal("spec-k-dec", kPartialHex ? hexToBig(kPartialHex).toString(10) : "");
  setVal("spec-k-bitlen", String(Number(maxBit) + 1));
  setVal("spec-k-hamming", "");
  setVal("spec-k-bin", "");
  setVal("spec-k-indices", $("indices")?.value || "");
}

const $ = (id) => document.getElementById(id);

/** @typedef {{
 *  id: string,
 *  kind: string,
 *  label: string,
 *  bitIndex: number|null,
 *  bit: number|null,
 *  compressed: string,
 *  x: string,
 *  y: string,
 *  lambda: string,
 *  formula: string,
 *  notes: string,
 * }} ChainRow */

/** @type {ChainRow[]} */
let chain = [];
let lastForward = null;
let rev = null;
let revSum = null;
let mode = null;
let activeId = null;
/** @type {'cards'|'full'} */
let chainView = "cards";
/** @type {'all'|'mul'|'add'|'both'} */
let chainFilter = "all";
let modalRowId = null;
/** @type {ReturnType<typeof createSeqPubSession>} */
let seqPub = createSeqPubSession();

function refreshSeqStatus() {
  const el = $("seq-pub-status");
  if (el) el.textContent = seqStatus(seqPub);
  const btn = $("btn-seq-pub");
  if (btn) {
    btn.classList.toggle("active", !!seqPub.active);
    btn.setAttribute("aria-pressed", seqPub.active ? "true" : "false");
    btn.textContent = seqPub.active ? "seq pub → pk ON" : "seq pub → pk OFF";
  }
}

function tryBaseKFromPriv(anchorPt) {
  const raw = String($("priv")?.value || "").trim();
  if (!raw || raw === "0") return null;
  try {
    const k = hexToBig(raw);
    if (k <= 0n) return null;
    const R = scalarMulDetailed(k, G()).point;
    if (samePt(R, anchorPt)) return k;
  } catch {
    /* ignore */
  }
  return null;
}

function appendSeqChainRows(result) {
  if (result.kind !== "step") return;
  const prevN = seqPub.points.length - 2;
  const prev = seqPub.points[prevN];
  const cur = seqPub.points[seqPub.points.length - 1];
  const bitPos =
    seqPub.bits.length > 0 ? seqPub.bits.length - 1 : null;
  // double sempre
  chain.push(
    emptyRow({
      kind: "double",
      label: `seq ↓ Double · bit?→${result.bit}`,
      bitIndex: bitPos,
      bit: result.bit,
      compressed: result.via === "2P" ? cur.compressed : prev?.compressed || "",
      x: result.via === "2P" ? cur.x : "",
      y: result.via === "2P" ? cur.y : "",
      formula: "R ← 2R",
      notes: `seq infer via=${result.via}`,
    })
  );
  if (result.bit === 1) {
    chain.push(
      emptyRow({
        kind: "add",
        label: "seq ↓ +G",
        bitIndex: bitPos,
        bit: 1,
        compressed: cur.compressed,
        x: cur.x,
        y: cur.y,
        formula: "R ← 2R+G",
        notes: "seq infer bit=1",
      })
    );
  } else {
    // atualiza tip do double com ponto final
    const last = chain[chain.length - 1];
    if (last) {
      last.compressed = cur.compressed;
      last.x = cur.x;
      last.y = cur.y;
    }
  }
  activeId = chain[chain.length - 1].id;
  renderChain();
}

function applySeqPrivFill() {
  const hex = seqPrivHex(seqPub);
  if (!hex) return;
  const shown = hex.replace(/^0+/, "") || "0";
  $("priv").value = shown;
  // indices = posições LSB com bit=1 (decided from MSB-first list)
  const L = seqPub.bits.length;
  const ones = [];
  for (let i = 0; i < L; i++) {
    if (seqPub.bits[i] === 1) {
      // bit MSB-first index i → LSB weight L-1-i
      ones.push(L - 1 - i);
    }
  }
  ones.sort((a, b) => a - b);
  if ($("indices")) $("indices").value = ones.join(",");
  if ($("maxbit")) $("maxbit").value = String(Math.max(0, L - 1));
  fillDerivedFromPriv(shown);
  rememberPriv(shown, "seq-pub");
  fillForwardSpec(
    {
      hex: shown,
      dec: BigInt("0x" + shown).toString(10),
      bitLength: L,
      hamming: seqPub.bits.reduce((a, b) => a + b, 0),
      bin: seqPub.bits.join(""),
      setBitsLSB: ones,
    },
    { whyAdd: "seq pub: bit=1 ↔ 2P+G" }
  );
}

function doSeqToggle() {
  if (seqPub.active) {
    seqPub = createSeqPubSession();
    refreshSeqStatus();
    flash("Seq pub → pk mode <b>OFF</b>", "info");
    return;
  }
  seqPub = createSeqPubSession();
  seqPub.active = true;
  mode = "seq";
  refreshSeqStatus();
  flash(
    "<b>Seq pub → pk ON</b>: paste the 1st pubkey (anchor), then always the <b>next</b> (2P or 2P+G). Enter or «↵ next pub».",
    "ok"
  );
}

function doSeqCommit() {
  if (!seqPub.active) {
    flash("Enable «seq pub → pk» first.", "warn");
    return;
  }
  const pubHex = String($("pub")?.value || "").trim();
  if (!pubHex) {
    flash("Paste a pubkey into the Public field.", "warn");
    return;
  }
  try {
    const opts = {};
    if (!seqPub.hasR) {
      const Pt = decompress(pubHex);
      const fromPriv = tryBaseKFromPriv(Pt);
      if (fromPriv != null) opts.baseK = fromPriv;
      else if (samePt(Pt, G())) {
        // G sem private → 1º passo desde ∞ (bit=1), não âncora k=1 estática
        opts.bootstrapGFromInf = true;
      }
    }
    const result = seqAcceptPub(seqPub, pubHex, opts);
    if (result.kind === "anchor" && result.needBase) {
      refreshSeqStatus();
      flash(result.message, "warn");
      return;
    }
    if (result.kind === "anchor") {
      refreshSeqStatus();
      flash(result.message, "ok");
      setStats([
        ["seq", "anchor"],
        ["baseK", String(seqPub.baseK.toString(16))],
        ["bits", "0"],
      ]);
      chain.push(
        emptyRow({
          kind: "copy",
          label: "seq anchor",
          compressed: result.point.compressed,
          x: result.point.x,
          y: result.point.y,
          notes: `baseK=${seqPub.baseK.toString(16)}`,
        })
      );
      activeId = chain[chain.length - 1].id;
      renderChain();
      if (seqPub.baseKnown) applySeqPrivFill();
      return;
    }
    if (result.kind === "reject") {
      flash(
        `${result.reason}<br><span class="mono">2P=${result.expected2P}<br>2P+G=${result.expected2PG}<br>got=${result.got}</span>`,
        "warn"
      );
      return;
    }
    appendSeqChainRows(result);
    applySeqPrivFill();
    refreshSeqStatus();
    flash(
      `bit=${result.bit} (${result.via}) · bits=<span class="mono">${seqPub.bits.join("")}</span> · k=<span class="mono">${result.kHex}</span>`,
      "ok"
    );
    setStats([
      ["seq bits", String(seqPub.bits.length)],
      ["bit", `${result.bit} · ${result.via}`],
      ["k", result.kHex],
      ["R", (result.compressed || "").slice(0, 14) + "…"],
    ]);
  } catch (e) {
    flash(e.message || String(e), "warn");
  }
}

function doSeqUndo() {
  if (!seqPub.active) return;
  const r = seqUndo(seqPub);
  refreshSeqStatus();
  if (r.kind === "noop") {
    flash("Nothing to undo in seq.", "info");
    return;
  }
  if (r.kHex) applySeqPrivFill();
  flash(`Seq undo · ${r.status || seqStatus(seqPub)}`, "info");
}

function doSeqStartInf() {
  if (!seqPub.active) {
    seqPub = createSeqPubSession();
    seqPub.active = true;
    mode = "seq";
  }
  const r = seqStartInfinity(seqPub);
  refreshSeqStatus();
  flash(r.message, "ok");
  chain.push(
    emptyRow({
      kind: "copy",
      label: "seq anchor ∞",
      compressed: "∞",
      notes: "baseK=0",
    })
  );
  activeId = chain[chain.length - 1].id;
  renderChain();
}

/**
 * Monta ∞→#1→…→#70→#75 contínuo: R ← R + Δ·G (Δ = k_n − k_{n−1}).
 * Ex.: #3→#4 (7→8) = um +G. Só double/add — sem half, sem âncora-quebra.
 */
async function doMountPuzzles170() {
  try {
    flash("Loading Δ·G path #1–#70→#75…", "info");
    const res = await fetch("js/data/puzzles_1_70_75_path.json?v=3");
    if (!res.ok) throw new Error("failed to read puzzles_1_70_75_path.json");
    const data = await res.json();
    const steps = data.steps || [];
    if (data.mode !== "delta_add_g") {
      flash(`Path mode=${data.mode} — expected delta_add_g. Regenerate the JSON.`, "warn");
    }
    if (steps.some((s) => s.op === "half" || s.op === "half1" || s.op === "restart")) {
      throw new Error("path still has half/restart — regenerate delta_add_g");
    }

    // confere landmarks: pub bate com k·G
    const landmarks = steps.filter((s) => s.landmark && s.puzzle != null);
    for (const lm of landmarks) {
      const k = hexToBig(lm.kHex);
      const P = scalarMulDetailed(k, G()).point;
      if (compress(P) !== lm.compressed) {
        throw new Error(`landmark #${lm.puzzle} pub ≠ kG`);
      }
    }

    chain = [];
    seqPub = createSeqPubSession();
    seqPub.active = true;
    mode = "seq";

    const nDbl = steps.filter((s) => s.op === "double").length;
    const nAdd = steps.filter((s) => s.op === "add").length;

    chain.push(
      emptyRow({
        kind: "copy",
        label: "∞",
        compressed: "∞",
        notes: "start · R←R+Δ·G between puzzles (×2 / + only)",
        formula: "delta add",
      })
    );

    for (const lm of landmarks) {
      const kind = lm.op === "add" ? "add" : lm.op === "double" ? "double" : "copy";
      chain.push(
        emptyRow({
          kind,
          label: `#${lm.puzzle}${lm.delta != null ? `  Δ=${lm.delta}` : ""}`,
          bit: lm.bit,
          compressed: lm.compressed,
          x: lm.x || "",
          y: lm.y || "",
          formula: lm.via || (lm.delta === "1" ? "+G" : "R+Δ·G"),
          notes: [
            `puzzle #${lm.puzzle}`,
            `k=${lm.kHex}`,
            lm.delta != null ? `Δ=${lm.delta}` : null,
            lm.bridge || null,
            lm.addr || null,
            "double/add only",
          ]
            .filter(Boolean)
            .join("\n"),
        })
      );
      rememberPriv(String(lm.kHex).replace(/^0+/, "") || "0", `#${lm.puzzle}`);
    }

    $("pub").value = data.finalPub;
    $("priv").value = (data.finalK || "").replace(/^0+/, "") || "0";
    fillDerivedFromPriv($("priv").value);
    rememberPriv($("priv").value, "#75-delta");

    seqPub.hasR = true;
    seqPub.R = decompress(data.finalPub);
    seqPub.baseK = hexToBig(data.finalK);
    seqPub.baseKnown = true;
    seqPub.bits = [];
    seqPub.points = [{ compressed: data.finalPub }];

    refreshSeqStatus();
    activeId = chain[chain.length - 1]?.id || null;
    renderChain();

    const gaps = (data.gaps_71_74 || []).map((g) => `#${g.n}`).join(",");
    const d78 = landmarks.find((l) => l.puzzle === 4);
    setStats([
      ["mode", "R+Δ·G"],
      ["ops", `${data.count} (×2=${nDbl} +=${nAdd})`],
      ["#3→#4", d78 ? `Δ=${d78.delta} ${d78.via}` : "—"],
      ["gaps", gaps || "—"],
      ["tip #75", data.finalK],
    ]);
    flash(
      `<b>Δ·G</b> path #1…#70→#75: <b>double/add</b> only (0 half). ` +
        `#3→#4 (7→8) = <b>+G</b>. #71–#74 pulados. Tip #<b>75</b>.`,
      "ok"
    );
    setDetail(
      JSON.stringify(
        {
          mode: data.mode,
          note: data.note,
          count: data.count,
          ops: data.ops,
          finalK: data.finalK,
          finalPub: data.finalPub,
          example_7_to_8: d78
            ? { puzzle: 4, delta: d78.delta, via: d78.via, k: d78.kHex }
            : null,
          gaps_71_74: data.gaps_71_74,
        },
        null,
        2
      )
    );
  } catch (e) {
    flash(e.message || String(e), "warn");
  }
}

function uid() {
  return "r" + Math.random().toString(36).slice(2, 9);
}

function emptyRow(partial = {}) {
  return {
    id: uid(),
    kind: "blank",
    label: "",
    bitIndex: null,
    bit: null,
    compressed: "",
    x: "",
    y: "",
    lambda: "",
    numer: "",
    denom: "",
    invDenom: "",
    lambdaSq: "",
    formula: "",
    notes: "",
    ...partial,
  };
}

function flash(html, kind = "info") {
  $("flash").innerHTML = `<div class="msg ${kind}">${html}</div>`;
}

function setStats(items) {
  $("stats").innerHTML = items
    .map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`)
    .join("");
}

function toast(msg) {
  let el = document.querySelector(".toast-copied");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast-copied";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 900);
}

async function copyText(text) {
  const t = String(text ?? "");
  if (!t) {
    toast("empty");
    return;
  }
  try {
    await navigator.clipboard.writeText(t);
    toast("copiado");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    toast("copiado");
  }
}

function fmtPtFields(pt) {
  if (!pt || pt.inf) {
    return { compressed: "∞", x: "", y: "" };
  }
  return {
    compressed: pt.compressed || "",
    x: pt.x || "",
    y: pt.y || "",
  };
}

function pointFromRow(row) {
  const c = (row.compressed || "").trim();
  if (c === "∞" || c === "O" || c.toLowerCase() === "inf") return null;
  if (c) return decompress(c);
  const x = (row.x || "").trim();
  const y = (row.y || "").trim();
  if (x && y) {
    const Pt = {
      x: BigInt("0x" + x.replace(/^0x/i, "")),
      y: BigInt("0x" + y.replace(/^0x/i, "")),
    };
    if (!onCurve(Pt)) throw new Error("x/y off-curve");
    return Pt;
  }
  throw new Error("row has no point (fill compressed or x+y)");
}

function rowFromPoint(pt, partial = {}) {
  const f = fmtPt(pt);
  return emptyRow({
    ...partial,
    ...fmtPtFields(f),
  });
}

function syncRowFieldsFromDom(rowEl, row) {
  const take = (sel) => rowEl.querySelector(sel);
  const compressed = take('[data-f="compressed"]');
  const x = take('[data-f="x"]');
  const y = take('[data-f="y"]');
  const lambda = take('[data-f="lambda"]');
  const numer = take('[data-f="numer"]');
  const denom = take('[data-f="denom"]');
  const invDenom = take('[data-f="invDenom"]');
  const lambdaSq = take('[data-f="lambdaSq"]');
  const formula = take('[data-f="formula"]');
  const notes = take('[data-f="notes"]');
  const label = take('[data-f="label"]');
  if (compressed) row.compressed = compressed.value.trim();
  if (x) row.x = x.value.trim();
  if (y) row.y = y.value.trim();
  if (lambda) row.lambda = lambda.value.trim();
  if (numer) row.numer = numer.value.trim();
  if (denom) row.denom = denom.value.trim();
  if (invDenom) row.invDenom = invDenom.value.trim();
  if (lambdaSq) row.lambdaSq = lambdaSq.value.trim();
  if (formula) row.formula = formula.value;
  if (notes) row.notes = notes.value;
  if (label) row.label = label.value.trim();
}

function readChainFromDom() {
  const roots = [
    ...document.querySelectorAll("#chain .calc-row[data-id]"),
    ...document.querySelectorAll("#chain-modal .calc-row[data-id]"),
  ];
  for (const el of roots) {
    const row = chain.find((r) => r.id === el.dataset.id);
    if (row) syncRowFieldsFromDom(el, row);
  }
}

/** Multiply family = Double / Half; Add family = +G / Half(R−G). */
function opFamily(kind) {
  if (kind === "double" || kind === "half") return "mul";
  if (kind === "add" || kind === "half1") return "add";
  return "other";
}

function kindLabel(kind) {
  switch (kind) {
    case "double":
      return "×2";
    case "add":
      return "+G";
    case "half":
      return "½";
    case "half1":
      return "½−G";
    case "seed":
      return "seed";
    default:
      return kind || "—";
  }
}

/** compressed → Set('mul'|'add') across the whole chain */
function buildPointFamilies(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const c = (row.compressed || "").trim().toLowerCase();
    if (!c || c === "∞" || c === "o" || c === "inf") continue;
    const f = opFamily(row.kind);
    if (f === "other") continue;
    if (!map.has(c)) map.set(c, new Set());
    map.get(c).add(f);
  }
  return map;
}

function rowPresence(row, families) {
  const c = (row.compressed || "").trim().toLowerCase();
  const set = c ? families.get(c) : null;
  const inMul = !!(set && set.has("mul"));
  const inAdd = !!(set && set.has("add"));
  if (inMul && inAdd) return "both";
  const own = opFamily(row.kind);
  if (own === "mul" || own === "add") return own;
  if (inMul) return "mul";
  if (inAdd) return "add";
  return "other";
}

function shortHex(h, head = 8, tail = 6) {
  const s = String(h || "").replace(/^0x/i, "");
  if (!s) return "—";
  if (s.length <= head + tail + 1) return s;
  return s.slice(0, head) + "…" + s.slice(-tail);
}

function passesFilter(row, presence) {
  if (chainFilter === "all") return true;
  if (chainFilter === "both") return presence === "both";
  if (chainFilter === "mul") return opFamily(row.kind) === "mul";
  if (chainFilter === "add") return opFamily(row.kind) === "add";
  return true;
}

function ensureModalOnBody() {
  const modal = $("chain-modal");
  if (modal && modal.parentElement !== document.body) {
    document.body.appendChild(modal);
  }
  return modal;
}

function closeChainModal() {
  modalRowId = null;
  const modal = $("chain-modal");
  if (modal) {
    modal.hidden = true;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  }
  document.body.classList.remove("modal-open");
  const body = $("chain-modal-body");
  if (body) body.innerHTML = "";
}

function openChainModal(rowId) {
  const idx = chain.findIndex((r) => r.id === rowId);
  if (idx < 0) return;
  const row = chain[idx];
  modalRowId = rowId;
  activeId = rowId;
  const families = buildPointFamilies(chain);
  const presence = rowPresence(row, families);
  const modal = ensureModalOnBody();
  const body = $("chain-modal-body");
  const title = $("chain-modal-title");
  if (!modal || !body) {
    console.warn("chain-modal missing in DOM");
    return;
  }
  if (title) {
    title.textContent = `#${idx + 1} · ${kindLabel(row.kind)} · ${row.label || row.kind}`;
  }
  body.innerHTML = "";
  const el = buildFullRowEl(row, idx, presence);
  body.appendChild(el);
  modal.hidden = false;
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  // foca o painel pra Escape / leitores
  modal.querySelector(".chain-modal-panel")?.focus?.();
}

function presenceClass(presence, kind) {
  if (presence === "both") return "op-both";
  if (presence === "mul" || kind === "double" || kind === "half")
    return "op-mul phase-double";
  if (presence === "add" || kind === "add" || kind === "half1")
    return "op-add phase-add";
  return "op-other";
}

function buildFullRowEl(row, idx, presence) {
  const el = document.createElement("div");
  el.className =
    "calc-row" +
    (row.id === activeId ? " active" : "") +
    " " +
    presenceClass(presence, row.kind);
  el.dataset.id = row.id;
  const meta =
    row.bitIndex != null
      ? `bit[${row.bitIndex}]${row.bit != null ? "=" + row.bit : ""}`
      : "";
  const famTag =
    presence === "both"
      ? "BOTH"
      : presence === "mul"
        ? "×2"
        : presence === "add"
          ? "+G"
          : "—";
  el.innerHTML = `
      <div class="calc-row-h">
        <div class="calc-num">${idx + 1}</div>
        <span class="calc-kind ${row.kind}">${esc(kindLabel(row.kind))}</span>
        <span class="chain-card-fam fam-${presence}">${famTag}</span>
        <input data-f="label" type="text" value="${esc(row.label)}" placeholder="label" style="max-width:14rem;font-family:var(--sans);font-size:12px" />
        <span class="calc-meta">${esc(meta)}</span>
        <button type="button" class="ghost sm" data-act="pin-pub" title="Pin compressed">📌</button>
        <button type="button" class="ghost sm" data-act="copy-all" title="Copy point">⧉ point</button>
        <button type="button" class="ghost sm" data-act="remove" title="Remove">✕</button>
      </div>
      <div class="calc-row-body">
        <div class="calc-fields">
          <div class="field" style="margin:0">
            <label>compressed (02/03… / ∞)</label>
            <div class="with-copy">
              <input data-f="compressed" type="text" spellcheck="false" value="${esc(row.compressed)}" />
              <button type="button" class="ghost sm" data-act="copy-f" data-key="compressed">⧉</button>
            </div>
          </div>
          <div class="calc-xy">
            <div class="field" style="margin:0">
              <label>x</label>
              <div class="with-copy">
                <input data-f="x" type="text" spellcheck="false" value="${esc(row.x)}" />
                <button type="button" class="ghost sm" data-act="copy-f" data-key="x">⧉</button>
              </div>
            </div>
            <div class="field" style="margin:0">
              <label>y</label>
              <div class="with-copy">
                <input data-f="y" type="text" spellcheck="false" value="${esc(row.y)}" />
                <button type="button" class="ghost sm" data-act="copy-f" data-key="y">⧉</button>
              </div>
            </div>
          </div>
          <div class="calc-math">
            <div class="field" style="margin:0">
              <label>λ</label>
              <div class="with-copy">
                <input data-f="lambda" type="text" spellcheck="false" value="${esc(row.lambda)}" />
                <button type="button" class="ghost sm" data-act="copy-f" data-key="lambda">⧉</button>
              </div>
            </div>
            <div class="field" style="margin:0">
              <label>λ²</label>
              <div class="with-copy">
                <input data-f="lambdaSq" type="text" spellcheck="false" value="${esc(row.lambdaSq || "")}" />
                <button type="button" class="ghost sm" data-act="copy-f" data-key="lambdaSq">⧉</button>
              </div>
            </div>
            <div class="field" style="margin:0">
              <label>numer</label>
              <div class="with-copy">
                <input data-f="numer" type="text" spellcheck="false" value="${esc(row.numer || "")}" />
                <button type="button" class="ghost sm" data-act="copy-f" data-key="numer">⧉</button>
              </div>
            </div>
            <div class="field" style="margin:0">
              <label>denom</label>
              <div class="with-copy">
                <input data-f="denom" type="text" spellcheck="false" value="${esc(row.denom || "")}" />
                <button type="button" class="ghost sm" data-act="copy-f" data-key="denom">⧉</button>
              </div>
            </div>
          </div>
          <div class="calc-xy">
            <div class="field" style="margin:0">
              <label>denom⁻¹</label>
              <div class="with-copy">
                <input data-f="invDenom" type="text" spellcheck="false" value="${esc(row.invDenom || "")}" />
                <button type="button" class="ghost sm" data-act="copy-f" data-key="invDenom">⧉</button>
              </div>
            </div>
            <div class="field" style="margin:0">
              <label>formula</label>
              <div class="with-copy">
                <input data-f="formula" type="text" spellcheck="false" value="${esc(row.formula)}" />
                <button type="button" class="ghost sm" data-act="copy-f" data-key="formula">⧉</button>
              </div>
            </div>
          </div>
          <div class="field" style="margin:0">
            <label>steps</label>
            <div class="with-copy">
              <textarea data-f="notes" rows="${row.notes ? 6 : 2}">${esc(row.notes)}</textarea>
              <button type="button" class="ghost sm" data-act="copy-f" data-key="notes">⧉</button>
            </div>
          </div>
        </div>
        <div class="calc-ops">
          <button type="button" class="op-down sm" data-act="double">↓ Double</button>
          <button type="button" class="op-down sm" data-act="addG">↓ +G</button>
          <span class="sep"></span>
          <button type="button" class="op-up sm" data-act="half">↑ Half</button>
          <button type="button" class="op-up sm" data-act="half1">↑ Half(R−G)</button>
          <span class="sep"></span>
          <button type="button" class="ghost sm" data-act="sync">sync x/y</button>
          <button type="button" class="ghost sm" data-act="to-pub">→ Pub</button>
          <button type="button" class="ghost sm" data-act="insert-below">+ below</button>
        </div>
      </div>`;
  wireRowActions(el, row, idx);
  return el;
}

function wireRowActions(el, row, idx) {
  el.addEventListener("click", () => {
    activeId = row.id;
  });
  el.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const act = btn.dataset.act;
      if (act === "copy-f") {
        const key = btn.dataset.key;
        const inp = el.querySelector(`[data-f="${key}"]`);
        copyText(inp?.value ?? "");
        return;
      }
      if (act === "copy-all") {
        readChainFromDom();
        const r = chain[idx];
        copyText(
          [
            r.compressed,
            r.x ? "x=" + r.x : "",
            r.y ? "y=" + r.y : "",
            r.lambda ? "λ=" + r.lambda : "",
            r.formula,
          ]
            .filter(Boolean)
            .join("\n")
        );
        return;
      }
      if (act === "remove") {
        readChainFromDom();
        chain.splice(idx, 1);
        closeChainModal();
        renderChain();
        return;
      }
      if (act === "sync") {
        syncCompressed(idx);
        return;
      }
      if (act === "pin-pub") {
        readChainFromDom();
        const c = (chain[idx].compressed || "").trim();
        if (!c || c === "∞") {
          flash("No compressed point to pin.", "warn");
          return;
        }
        try {
          const pin = addPin({ kind: "pub", value: c });
          refreshPins(pin.id);
          refreshRelations();
          flash(`📌 point L${idx + 1} pinned — name it on the right.`, "ok");
        } catch (e) {
          flash(e.message || String(e), "warn");
        }
        return;
      }
      if (act === "to-pub") {
        pushToPub(idx);
        return;
      }
      if (act === "insert-below") {
        readChainFromDom();
        chain.splice(idx + 1, 0, emptyRow({ label: "manual" }));
        closeChainModal();
        renderChain();
        return;
      }
      if (act === "double") return opFromRow(idx, "down", "double");
      if (act === "addG") return opFromRow(idx, "down", "addG");
      if (act === "half") return opFromRow(idx, "up", "half");
      if (act === "half1") return opFromRow(idx, "up", "half1");
    });
  });
}

function buildCardEl(row, idx, presence) {
  const el = document.createElement("button");
  el.type = "button";
  el.className =
    "chain-card op-" +
    presence +
    (row.id === activeId ? " active" : "");
  el.dataset.id = row.id;
  const famTag =
    presence === "both"
      ? "BOTH"
      : presence === "mul"
        ? "×2"
        : presence === "add"
          ? "+G"
          : "—";
  const xFull = String(row.x || "").replace(/^0x/i, "") || "—";
  const yFull = String(row.y || "").replace(/^0x/i, "") || "—";
  const bitBar =
    row.bitIndex != null && (row.kind === "double" || row.kind === "add")
      ? `<div class="chain-card-bitbar ${Number(row.bit) === 1 ? "bit-on" : "bit-off"}">
          <span class="chain-card-bitbar-tag">bit[${esc(String(row.bitIndex))}]=${esc(String(row.bit ?? "?"))}</span>
          <span class="chain-card-bitbar-msg">${
            Number(row.bit) === 1
              ? row.kind === "double"
                ? "×2 → then +G"
                : "+G on this bit"
              : "×2 only · no +G"
          }</span>
        </div>`
      : row.bitIndex != null
        ? `<div class="chain-card-bitbar bit-other">
            <span class="chain-card-bitbar-tag">bit[${esc(String(row.bitIndex))}]=${esc(String(row.bit ?? "?"))}</span>
          </div>`
        : "";
  el.innerHTML = `
    ${bitBar}
    <div class="chain-card-h">
      <div class="calc-num">${idx + 1}</div>
      <span class="chain-card-kind">${esc(kindLabel(row.kind))}</span>
      <span class="chain-card-fam fam-${presence}">${famTag}</span>
    </div>
    <div class="chain-card-label" title="${esc(row.label || "")}">${esc(row.label || row.kind || "—")}</div>
    <div class="chain-card-pub" title="${esc(row.compressed || "")}">${esc(shortHex(row.compressed, 10, 8))}</div>
    <div class="chain-card-xy">
      <div class="chain-card-xy-row"><b>x</b><code>${esc(xFull)}</code></div>
      <div class="chain-card-xy-row"><b>y</b><code>${esc(yFull)}</code></div>
    </div>
    <div class="chain-card-grid">
      <div><b>λ</b><span title="${esc(row.lambda)}">${esc(shortHex(row.lambda))}</span></div>
      <div><b>λ²</b><span title="${esc(row.lambdaSq)}">${esc(shortHex(row.lambdaSq))}</span></div>
      <div><b>numer</b><span title="${esc(row.numer)}">${esc(shortHex(row.numer))}</span></div>
      <div><b>denom</b><span title="${esc(row.denom)}">${esc(shortHex(row.denom))}</span></div>
    </div>
    <div class="chain-card-formula" title="${esc(row.formula)}">${esc(row.formula || "—")}</div>
    <div class="chain-card-hint">click → full math</div>`;
  el.addEventListener("click", () => openChainModal(row.id));
  return el;
}

function syncChainToolbar() {
  document.querySelectorAll("#chain-toolbar [data-view]").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === chainView);
  });
  document.querySelectorAll("#chain-toolbar [data-filt]").forEach((b) => {
    b.classList.toggle("active", b.dataset.filt === chainFilter);
  });
}

/** Always insert a fresh result row (never overwrite seed / prior work). */
function insertBelow(idx) {
  chain.splice(idx + 1, 0, emptyRow({ kind: "blank", label: "result ↓" }));
  return idx + 1;
}

function insertAbove(idx) {
  chain.splice(idx, 0, emptyRow({ kind: "blank", label: "result ↑" }));
  return idx; // new row sits at idx; source shifts to idx+1
}

function writeResultTo(targetIdx, pt, meta) {
  const f = fmtPt(pt);
  const fields = fmtPtFields(f);
  const row = chain[targetIdx];
  Object.assign(row, {
    kind: meta.kind || row.kind,
    label: meta.label ?? row.label,
    bitIndex: meta.bitIndex ?? row.bitIndex,
    bit: meta.bit ?? row.bit,
    compressed: fields.compressed,
    x: fields.x,
    y: fields.y,
    lambda: meta.lambda ?? "",
    numer: meta.numer ?? "",
    denom: meta.denom ?? "",
    invDenom: meta.invDenom ?? "",
    lambdaSq: meta.lambdaSq ?? "",
    formula: meta.formula ?? "",
    notes: meta.notes ?? "",
  });
  activeId = row.id;
}

function mathFromAddTrace(trace, ctx = {}) {
  return {
    lambda: trace?.lambda != null ? bigToHex(trace.lambda, 64) : "",
    numer: trace?.numer != null ? bigToHex(trace.numer, 64) : "",
    denom: trace?.denom != null ? bigToHex(trace.denom, 64) : "",
    invDenom: trace?.invDenom != null ? bigToHex(trace.invDenom, 64) : "",
    lambdaSq: trace?.lambdaSq != null ? bigToHex(trace.lambdaSq, 64) : "",
    formula: trace?.formula || "",
    notes: formatAddTraceNotes(trace, ctx),
  };
}

/* ── Ops from a row ─────────────────────────────────────── */
function opFromRow(idx, direction, op) {
  try {
    readChainFromDom();
    const src = chain[idx];
    const Pt = pointFromRow(src);
    let result;
    let meta;

    if (op === "double") {
      const r = doubleDetailed(Pt);
      result = r.point;
      const m = mathFromAddTrace(r.trace, {
        kind: "double",
        algoWhy: "R ← 2R (forward MSB-first)",
      });
      meta = { kind: "double", label: "↓ Double · R ← 2R", ...m };
    } else if (op === "addG") {
      const r = addDetailed(Pt, G());
      result = r.point;
      const m = mathFromAddTrace(r.trace, {
        kind: "add",
        algoWhy: "R ← R+G (bit=1 no forward)",
      });
      meta = { kind: "add", label: "↓ +G · R ← R+G", ...m };
    } else if (op === "half") {
      const r = halfDetailed(Pt);
      result = r.point;
      meta = {
        kind: "half",
        label: "↑ Half · R ← half(R)  [bit=0]",
        bit: 0,
        lambda: "",
        formula: r.trace.formula,
        notes: formatHalfTraceNotes(r.trace, { bit: 0 }),
      };
    } else if (op === "half1") {
      const s = subDetailed(Pt, G());
      const h = halfDetailed(s.point);
      result = h.point;
      meta = {
        kind: "half1",
        label: "↑ Half(R−G)  [bit=1]",
        bit: 1,
        ...mathFromAddTrace(s.trace, { kind: "sub G" }),
        formula: "R←R−G; then half(R)",
        notes: formatHalf1Notes(s.trace, h.trace, {}),
      };
    } else {
      throw new Error("unknown op");
    }

    const targetIdx =
      direction === "down" ? insertBelow(idx) : insertAbove(idx);
    const srcAfter = direction === "down" ? idx : idx + 1;
    writeResultTo(targetIdx, result, meta);

    mode = direction === "down" ? "fwd-manual" : "rev-manual";
    renderChain();
    flash(
      `Op <b>${meta.label}</b> · from L${srcAfter + 1} → result L${targetIdx + 1} (copyable fields).`,
      "ok"
    );
    setDetail(
      JSON.stringify(
        {
          from: srcAfter + 1,
          to: targetIdx + 1,
          op,
          direction,
          result: fmtPt(result),
        },
        null,
        2
      )
    );
  } catch (e) {
    flash(e.message || String(e), "warn");
  }
}

function syncCompressed(idx) {
  try {
    readChainFromDom();
    const row = chain[idx];
    const Pt = pointFromRow(row);
    const f = fmtPt(Pt);
    Object.assign(row, fmtPtFields(f));
    if (isInf(Pt)) {
      row.compressed = "∞";
      row.x = "";
      row.y = "";
    }
    renderChain();
    flash("Point synced (compressed ↔ x/y).", "ok");
  } catch (e) {
    flash(e.message || String(e), "warn");
  }
}

function pushToPub(idx) {
  readChainFromDom();
  const c = chain[idx].compressed.trim();
  if (!c || c === "∞") {
    flash("No valid compressed point.", "warn");
    return;
  }
  $("pub").value = c;
  flash("Public filled from this row.", "ok");
}

let lastPinFocusId = null;

function refreshPins(focusId = null) {
  if (focusId) lastPinFocusId = focusId;
  const box = $("pins-list");
  if (!box) return;
  renderPinsList(box, {
    focusId: lastPinFocusId,
    onLoad: (pin) => {
      if (pin.kind === "priv") {
        $("priv").value = pin.value;
        fillDerivedFromPriv(pin.value);
        rememberPriv(pin.value, "pin");
        flash(`Pin «${pin.name}» → Priv`, "ok");
      } else {
        $("pub").value = pin.value;
        flash(`Pin «${pin.name}» → Pub`, "ok");
      }
      refreshRelations();
    },
    onRename: (id, name) => {
      renamePin(id, name);
      lastPinFocusId = null;
      refreshPins();
      refreshRelations();
    },
    onRemove: (id) => {
      removePin(id);
      lastPinFocusId = null;
      refreshPins();
      refreshRelations();
    },
  });
}

function refreshRelations() {
  const box = $("relations-list");
  if (!box) return;
  try {
    readChainFromDom();
  } catch {
    /* ignore */
  }
  const findings = analyzeRelations({
    chain,
    pins: loadPins(),
    priv: $("priv")?.value || "",
    pub: $("pub")?.value || "",
    Gcompressed: G_COMPRESSED,
  });
  renderRelationsList(box, findings);
}

let histPage = 0;
let histStatusById = {};
let histPaintSeq = 0;

function derivedAddrs(d) {
  if (!d) return { btc: [], eth: [], bnb: [] };
  return {
    btc: [
      d.btc_p2pkh_compressed,
      d.btc_p2pkh_uncompressed,
      d.btc_p2sh_p2wpkh,
      d.btc_p2wpkh,
      d.btc_p2tr,
    ].filter(Boolean),
    eth: d.eth_address ? [d.eth_address] : [],
    bnb: d.bnb_address || d.eth_address ? [d.bnb_address || d.eth_address] : [],
  };
}

function statHasBalance(stat) {
  return !!(stat && !stat.error && parseBalanceNum(stat.balance) > 0);
}

function statHasTx(stat) {
  if (!stat || stat.error) return false;
  for (const k of ["txTotal", "txIn", "txOut"]) {
    const n = Number(stat[k]);
    if (Number.isFinite(n) && n > 0) return true;
  }
  return false;
}

/** funded > used > empty — a partir de lista de stats. */
function classifyStats(stats) {
  let used = false;
  for (const s of stats) {
    if (statHasBalance(s)) return "funded";
    if (statHasTx(s)) used = true;
  }
  return used ? "used" : "empty";
}

function classifyFromCache(d) {
  const { btc, eth, bnb } = derivedAddrs(d);
  const stats = [];
  for (const a of btc) stats.push(getCachedStat("btc", a));
  for (const a of eth) stats.push(getCachedStat("eth", a));
  for (const a of bnb) stats.push(getCachedStat("bnb", a));
  // se nenhum addr tem cache, ainda não sabemos
  if (stats.every((s) => !s)) return "";
  return classifyStats(stats);
}

function classifyFromFetchResult(d, res) {
  const { btc, eth, bnb } = derivedAddrs(d);
  const stats = [];
  for (const a of btc) stats.push(res.btc?.stats?.[a] || getCachedStat("btc", a));
  for (const a of eth) stats.push(res.eth?.stats?.[a] || getCachedStat("eth", a));
  for (const a of bnb) stats.push(res.bnb?.stats?.[a] || getCachedStat("bnb", a));
  return classifyStats(stats);
}

function rememberPriv(privHex, note = "") {
  try {
    const v = String(privHex || "").trim();
    if (!v) return;
    pushPrivHistory(v, note);
    refreshHistory();
  } catch (e) {
    console.warn("rememberPriv", e);
  }
}

function refreshHistory(page = histPage) {
  const box = $("history-list");
  if (!box) return;
  const rendered = renderHistoryList(box, {
    page,
    statusById: histStatusById,
    onLoad: (e) => {
      $("priv").value = e.value;
      fillDerivedFromPriv(e.value);
      flash(`History → Priv <span class="mono">${e.value}</span>`, "ok");
      refreshRelations();
    },
    onRemove: (id) => {
      removeHistoryEntry(id);
      delete histStatusById[id];
      refreshHistory(histPage);
    },
    onPage: (p) => refreshHistory(p),
  });
  histPage = rendered.page;
  paintHistoryStatuses(rendered.slice);
}

/** Cache imediato + fetch da página (10) em background. */
async function paintHistoryStatuses(slice) {
  if (!slice?.length) return;
  const seq = ++histPaintSeq;

  // 1) cache → pinta o que já souber
  const needFetch = [];
  for (const e of slice) {
    try {
      const d = deriveFromPrivate(e.value);
      const st = classifyFromCache(d);
      if (st) histStatusById[e.id] = st;
      else needFetch.push({ e, d });
      applyHistCardStatus(e.id, histStatusById[e.id] || "");
    } catch {
      histStatusById[e.id] = "empty";
      applyHistCardStatus(e.id, "empty");
    }
  }

  if (!needFetch.length) return;

  // 2) online para os sem cache (agrupa addrs da página)
  try {
    const btc = [];
    const eth = [];
    const bnb = [];
    for (const { d } of needFetch) {
      const a = derivedAddrs(d);
      btc.push(...a.btc);
      eth.push(...a.eth);
      bnb.push(...a.bnb);
    }
    const res = await fetchAllAddressStats({ btc, eth, bnb, forceRefresh: false });
    if (seq !== histPaintSeq) return;
    for (const { e, d } of needFetch) {
      histStatusById[e.id] = classifyFromFetchResult(d, res);
      applyHistCardStatus(e.id, histStatusById[e.id]);
    }
  } catch (err) {
    console.warn("hist paint fetch", err);
    for (const { e } of needFetch) {
      if (!histStatusById[e.id]) {
        histStatusById[e.id] = "empty";
        applyHistCardStatus(e.id, "empty");
      }
    }
  }
}

function applyHistCardStatus(id, st) {
  const el = document.querySelector(`#history-list .hist-card[data-id="${id}"]`);
  if (!el) return;
  el.classList.remove("funded", "used");
  if (st === "funded" || st === "used") el.classList.add(st);
  el.dataset.status = st || "empty";
  const flag = el.querySelector(".hist-flag");
  if (flag) {
    flag.textContent =
      st === "funded" ? "balance" : st === "used" ? "had tx" : st === "empty" ? "empty" : "…";
  }
}

function doPin(kind) {
  try {
    const value =
      kind === "priv" ? $("priv").value.trim() : $("pub").value.trim();
    if (!value) throw new Error(`fill ${kind} before pinning`);
    const pin = addPin({ kind, value });
    refreshPins(pin.id);
    refreshRelations();
    flash(
      `📌 ${kind} pinado — nomeie na barra da sidebar direita.`,
      "ok"
    );
  } catch (e) {
    flash(e.message || String(e), "warn");
  }
}

function appendBitSepIfNeeded(box, row, idx) {
  const prev = chain[idx - 1];
  const bitChanged =
    row.bitIndex != null &&
    (idx === 0 ||
      !prev ||
      prev.bitIndex !== row.bitIndex ||
      prev.kind === "seed" ||
      prev.kind === "blank");
  if (!(bitChanged && (row.kind === "double" || row.kind === "add"))) return;
  const bit = row.bit != null ? row.bit : "?";
  const sep = document.createElement("div");
  sep.className = "op-bit-sep" + (Number(bit) === 1 ? " bit-on" : " bit-off");
  sep.setAttribute("role", "separator");
  sep.innerHTML = `
    <span class="op-bit-sep-tag">bit[${esc(String(row.bitIndex))}]=${esc(String(bit))}</span>
    <span class="op-bit-sep-msg">${
      Number(bit) === 1
        ? "this bit: Double (×2) → then Add (+G)"
        : "this bit: Double (×2) only · no Add"
    }</span>`;
  box.appendChild(sep);
}

function renderChain() {
  const box = $("chain");
  if (!box) return;
  syncChainToolbar();
  box.classList.toggle("chain-cards", chainView === "cards");
  box.classList.toggle("chain-full", chainView === "full");

  if (!chain.length) {
    box.innerHTML = `<div class="muted">Empty chain — run Priv→Pub, Pub→seed, or «+ empty row».</div>`;
    closeChainModal();
    refreshRelations();
    return;
  }

  const families = buildPointFamilies(chain);
  box.innerHTML = "";
  let shown = 0;

  chain.forEach((row, idx) => {
    const presence = rowPresence(row, families);
    if (!passesFilter(row, presence)) return;
    // separador de bit só na lista — em cards quebra a grade (1 card + barra)
    if (chainView === "full") appendBitSepIfNeeded(box, row, idx);
    if (chainView === "cards") {
      box.appendChild(buildCardEl(row, idx, presence));
    } else {
      box.appendChild(buildFullRowEl(row, idx, presence));
    }
    shown += 1;
  });

  if (!shown) {
    box.innerHTML = `<div class="muted">No ops for this filter (${chainFilter}). Change the filter above.</div>`;
  }

  // se modal aberto, reabrir com dados atualizados
  if (modalRowId && chain.some((r) => r.id === modalRowId)) {
    openChainModal(modalRowId);
  } else if (modalRowId) {
    closeChainModal();
  }

  refreshRelations();
  try {
    refreshStatePreview(chain, lastForward);
  } catch (e) {
    console.warn("STATE preview", e);
  }
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function setDetail(text) {
  const t = text ?? "";
  for (const id of ["detail-top", "detail-bot"]) {
    const el = $(id);
    if (el) el.textContent = t;
  }
}

function clearBitrows() {
  for (const id of ["bitrow-top", "bitrow-bot"]) {
    const el = $(id);
    if (el) el.innerHTML = "";
  }
}

function renderBits(cells, cursor = null, decided = null) {
  for (const id of ["bitrow-top", "bitrow-bot"]) {
    const row = $(id);
    if (!row) continue;
    row.innerHTML = "";
    cells.forEach((c, idx) => {
      // régua: gap visual a cada 5 bits (índices), sem pular célula
      if (idx > 0 && idx % 5 === 0) {
        const gap = document.createElement("div");
        gap.className = "bit-gap";
        gap.title = "grupo de 5";
        row.appendChild(gap);
      }
      const d = document.createElement("div");
      const known = decided ? decided[c.i] !== undefined : true;
      d.className =
        "bit " +
        (c.bit ? "on" : "off") +
        (c.i === cursor ? " cursor" : "");
      d.style.opacity = known ? "1" : "0.35";
      d.title = `bit[${c.i}] = ${c.bit}`;
      d.innerHTML = `<span class="bit-i">${c.i}</span><span class="bit-v">${c.bit}</span>`;
      row.appendChild(d);
    });
  }
}

/* ── Forward: Priv → Pub + chain ────────────────────────── */
function doForward() {
  try {
    const hex = $("priv").value.trim();
    lastForward = forwardFromPrivate(hex);
    mode = "fwd";
    rev = null;
    revSum = null;

    const p = lastForward.private;
    const pub = lastForward.public;
    $("pub").value = pub.compressed;
    $("maxbit").value = String(p.bitLength - 1);
    $("indices").value = p.setBitsLSB.join(",");

    setStats([
      ["bitlen", p.bitLength],
      ["hamming", p.hamming],
      ["doubles", lastForward.counters.doubles],
      ["adds", lastForward.counters.adds],
      ["rows", String(lastForward.operations.length + 1)],
    ]);

    fillForwardSpec(p, lastForward.algorithm);
    fillDerivedFromPriv(p.hex);
    rememberPriv(p.hex, "forward");

    // seed + one row per op (spec/k/curva ficam no painel de campos, não em notas)
    chain = [];
    chain.push(
      emptyRow({
        kind: "seed",
        label: "R start = O",
        compressed: "∞",
        formula: "R ← O",
        notes: "",
      })
    );
    lastForward.operations.forEach((op) => {
      const after = op.R_after;
      const fields = fmtPtFields(after);
      chain.push(
        emptyRow({
          kind: op.kind,
          label:
            op.kind === "double"
              ? `↓ Double bit[${op.bitIndex}]`
              : `↓ +G bit[${op.bitIndex}]=1`,
          bitIndex: op.bitIndex,
          bit: op.bit,
          compressed: fields.compressed,
          x: fields.x,
          y: fields.y,
          lambda: op.math.lambda || "",
          numer: op.math.numer || "",
          denom: op.math.denom || "",
          invDenom: op.math.invDenom || "",
          lambdaSq: op.math.lambdaSq || "",
          formula: op.math.formula || "",
          notes: formatForwardOpNotes(op),
          scalar: p.hex,
          scalarDec: p.dec != null ? String(p.dec) : "",
          bits: p.bin || "",
        })
      );
    });
    if (chain.length) {
      const last = chain[chain.length - 1];
      last.scalar = p.hex;
      last.bits = p.bin || "";
    }
    activeId = chain[chain.length - 1]?.id;
    renderChain();
    renderBits(bitGrid(lastForward));
    flash(
      `Chain filled (${chain.length} rows). Edit any field and run ↓/↑ from there.`,
      "ok"
    );
    setDetail(`Q = ${pub.compressed}\nk = ${p.hex}`);
  } catch (e) {
    flash(e.message || String(e), "warn");
  }
}

/* ── Reverse seed ───────────────────────────────────────── */
function doRevInit() {
  try {
    const pub = $("pub").value.trim();
    const maxBit = Number($("maxbit").value);
    rev = createReverseSession(pub, maxBit);
    revSum = summarize(rev);
    mode = "rev";
    lastForward = null;

    const q = fmtPt(rev.Q);
    fillReverseSpec(maxBit, q, revSum.kPartialHex);
    chain = [
      emptyRow({
        kind: "seed",
        label: "Q (pubkey) — reverse goes up with ↑",
        compressed: q.compressed,
        x: q.x,
        y: q.y,
        formula: "R ← Q",
        notes: "",
      }),
    ];
    activeId = chain[0].id;
    renderChain();
    renderReverseBits();
    setStats([
      ["cursor", `${revSum.cursor} / ${revSum.maxBit}`],
      ["decided", "0"],
      ["direction", "Pub → ↑"],
    ]);
    flash(
      `Chain seed = Q. On each row: ↑ Half (bit=0) or ↑ Half(R−G) (bit=1).`,
      "info"
    );
  } catch (e) {
    flash(e.message || String(e), "warn");
  }
}

function renderReverseBits() {
  if (!revSum) return;
  const cells = [];
  for (let i = revSum.maxBit; i >= 0; i--) {
    const v = revSum.decided[i];
    cells.push({
      i,
      bit: v === undefined ? 0 : Number(v),
    });
  }
  renderBits(cells, revSum.cursor, revSum.decided);
}

function rebuildChainFromReverse() {
  if (!rev || !revSum) return;
  const q = fmtPt(rev.Q);
  fillReverseSpec(revSum.maxBit, q, revSum.privateHex || revSum.kPartialHex);
  if (revSum.privateHex) {
    try {
      const k = hexToBig(revSum.privateHex);
      setVal("spec-k-dec", k.toString(10));
      setVal("spec-k-bitlen", k.toString(2).length);
      setVal("spec-k-bin", k.toString(2));
      setVal(
        "spec-k-hamming",
        [...k.toString(2)].filter((c) => c === "1").length
      );
      setVal(
        "spec-k-indices",
        Object.entries(revSum.decided)
          .filter(([, b]) => Number(b) === 1)
          .map(([i]) => i)
          .sort((a, b) => Number(a) - Number(b))
          .join(",")
      );
    } catch {
      /* ignore */
    }
  }
  chain = [
    emptyRow({
      kind: "seed",
      label: "Q",
      compressed: q.compressed,
      x: q.x,
      y: q.y,
      formula: "R ← Q",
      notes: "",
    }),
  ];
  revSum.history.forEach((h) => {
    const after = h.R_after;
    const fields = fmtPtFields(after);
    chain.push(
      emptyRow({
        kind: h.bit === 1 ? "half1" : "half",
        label:
          h.bit === 1
            ? `↑ Half(R−G) bit[${h.bitIndex}]=1`
            : `↑ Half bit[${h.bitIndex}]=0`,
        bitIndex: h.bitIndex,
        bit: h.bit,
        compressed: fields.compressed,
        x: fields.x,
        y: fields.y,
        lambda: h.subLambda || "",
        formula: h.halfFormula || "",
        notes:
          h.labNotes ||
          (h.bit === 1
            ? `R−G:\n${h.afterSub?.compressed || ""}\n${(h.subSteps || []).join("\n")}\n\n`
            : "") + (h.halfSteps || []).join("\n"),
      })
    );
  });
  // current R tip
  if (revSum.history.length) {
    activeId = chain[chain.length - 1].id;
  }
  renderChain();
  renderReverseBits();

  setStats([
    ["cursor", `${revSum.cursor} / ${revSum.maxBit}`],
    ["decided", Object.keys(revSum.decided).length],
    ["k parcial", revSum.kPartialHex.slice(-16)],
    ["R", revSum.R.compressed?.slice(0, 10) + "…"],
  ]);

  if (revSum.privateHex) {
    $("priv").value = revSum.privateHex;
    fillDerivedFromPriv(revSum.privateHex);
    rememberPriv(revSum.privateHex, "reverse");
    flash(`★ Private: <span class="mono">${revSum.privateHex}</span>`, "ok");
  } else {
    flash(revSum.status, revSum.status.includes("incompat") ? "warn" : "info");
  }
  setDetail(
    JSON.stringify(
      {
        status: revSum.status,
        cursor: revSum.cursor,
        decided: revSum.decided,
        privateHex: revSum.privateHex,
        R: revSum.R,
      },
      null,
      2
    )
  );
}

function doApplyIndices() {
  try {
    if (!rev) {
      rev = createReverseSession(
        $("pub").value.trim(),
        Number($("maxbit").value)
      );
    }
    const raw = $("indices").value.trim();
    const bits = raw
      ? raw.split(/[,\s]+/).filter(Boolean).map(Number)
      : [];
    revSum = applyKnownSetBits(rev, bits);
    mode = "rev";
    rebuildChainFromReverse();
  } catch (e) {
    flash(e.message || String(e), "warn");
  }
}

function doRevUndo() {
  if (!rev) return;
  revSum = undoLast(rev);
  rebuildChainFromReverse();
}

function exportAll() {
  readChainFromDom();
  const payload = {
    mode,
    priv: $("priv").value,
    pub: $("pub").value,
    maxbit: $("maxbit").value,
    indices: $("indices").value,
    chain,
    forward: mode === "fwd" ? lastForward : null,
    reverse: revSum,
  };
  const blob = new Blob(
    [
      mode === "fwd" && lastForward
        ? exportJSON({ ...lastForward, chain })
        : JSON.stringify(payload, null, 2),
    ],
    { type: "application/json" }
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "ecc-chain.json";
  a.click();
}

/** Parse ± passo: decimal por padrão; hex com 0x… ou letras a–f. */
function parsePrivStep(raw, label = "step") {
  const s = String(raw ?? "").trim().toLowerCase().replace(/_/g, "");
  if (!s) throw new Error(`enter ${label}`);
  if (/^(dec:|10:)/.test(s)) {
    const rest = s.replace(/^(dec:|10:)/, "");
    if (!/^[0-9]+$/.test(rest)) throw new Error(`${label} invalid decimal`);
    return BigInt(rest);
  }
  if (/^0x[0-9a-f]+$/.test(s)) return BigInt(s);
  if (/^[0-9]+$/.test(s)) return BigInt(s);
  if (/^[0-9a-f]+$/.test(s) && /[a-f]/.test(s)) return BigInt("0x" + s);
  throw new Error(`${label} invalid (use dec, e.g. 3, or hex 0x…)`);
}

/**
 * Parse lo/hi do random-range: HEX por padrão (igual ao campo private).
 * Decimal só com prefixo dec: / 10:  — evita 4000… virar 4e17 em vez de 0x4000….
 */
function parsePrivBound(raw, label = "bound") {
  const s = String(raw ?? "").trim().toLowerCase().replace(/_/g, "");
  if (!s) throw new Error(`enter ${label}`);
  if (/^(dec:|10:)/.test(s)) {
    const rest = s.replace(/^(dec:|10:)/, "");
    if (!/^[0-9]+$/.test(rest)) throw new Error(`${label} invalid decimal`);
    return BigInt(rest);
  }
  if (/^0x[0-9a-f]+$/.test(s)) return BigInt(s);
  if (/^[0-9a-f]+$/.test(s)) return BigInt("0x" + s);
  throw new Error(`${label} invalid (hex, e.g. 4000… or 0x4000…; decimal with dec: prefix)`);
}

/** Uniform BigInt in [lo, hi] via rejection sampling (crypto.getRandomValues). */
function randomBigIntInclusive(lo, hi) {
  if (typeof lo !== "bigint" || typeof hi !== "bigint") {
    throw new Error("range must be BigInt");
  }
  if (hi < lo) throw new Error("hi < lo");
  const span = hi - lo + 1n;
  if (span === 1n) return lo;
  const bits = span.toString(2).length;
  const bytes = Math.ceil(bits / 8);
  const mask = (1n << BigInt(bits)) - 1n;
  for (let attempt = 0; attempt < 64; attempt++) {
    const buf = new Uint8Array(bytes);
    crypto.getRandomValues(buf);
    let x = 0n;
    for (const b of buf) x = (x << 8n) | BigInt(b);
    x &= mask;
    if (x < span) return lo + x;
  }
  throw new Error("failed to sample random (try again)");
}

function applyRandomPriv(k, note) {
  if (k <= 0n || k >= N) throw new Error("private out of [1, n−1]");
  const shown = bigToHex(k).replace(/^0+/, "") || "0";
  $("priv").value = shown;
  fillDerivedFromPriv(shown);
  rememberPriv(shown, note);
  flash(
    `${note} → <span class="mono">${shown}</span> · bitlen ${k.toString(2).length}`,
    "ok"
  );
  return shown;
}

function randomPrivFull() {
  try {
    const k = randomBigIntInclusive(1n, N - 1n);
    applyRandomPriv(k, "🎲 random [1, n−1]");
  } catch (e) {
    flash(e.message || String(e), "warn");
  }
}

function randomPrivRange() {
  try {
    let lo = parsePrivBound($("priv-lo").value, "lo");
    let hi = parsePrivBound($("priv-hi").value, "hi");
    if (lo > hi) {
      const t = lo;
      lo = hi;
      hi = t;
    }
    // clamp ao domínio válido da curva
    if (hi < 1n || lo >= N) {
      throw new Error("range out of [1, n−1]");
    }
    if (lo < 1n) lo = 1n;
    if (hi >= N) hi = N - 1n;
    const k = randomBigIntInclusive(lo, hi);
    if (k < lo || k > hi) throw new Error("sample out of range (bug)");
    const loH = bigToHex(lo).replace(/^0+/, "") || "0";
    const hiH = bigToHex(hi).replace(/^0+/, "") || "0";
    applyRandomPriv(k, `🎲 range [0x${loH} … 0x${hiH}]`);
  } catch (e) {
    flash(e.message || String(e), "warn");
  }
}

function nudgePriv(sign) {
  try {
    const k = hexToBig($("priv").value.trim() || "0");
    const step = parsePrivStep($("priv-step").value);
    if (step <= 0n) throw new Error("step must be > 0");
    // permanece em [1, n−1]
    const range = N - 1n;
    let next = mod(k - 1n + sign * step, range) + 1n;
    const shown = bigToHex(next).replace(/^0+/, "") || "0";
    $("priv").value = shown;
    fillDerivedFromPriv(shown);
    rememberPriv(shown, sign > 0n ? "+step" : "−step");
    flash(
      `Private ${sign > 0n ? "+" : "−"} ${step.toString(10)} → <span class="mono">${shown}</span>`,
      "ok"
    );
  } catch (e) {
    flash(e.message || String(e), "warn");
  }
}

function onClick(id, fn) {
  const el = $(id);
  if (el) el.onclick = fn;
}

function boot() {
  try {
    onClick("btn-fwd", doForward);
    onClick("btn-rev-init", doRevInit);
    onClick("btn-undo", doRevUndo);
    onClick("btn-apply-idx", doApplyIndices);
    onClick("btn-export", exportAll);
    onClick("btn-seq-pub", doSeqToggle);
    onClick("btn-seq-commit", doSeqCommit);
    onClick("btn-seq-undo", doSeqUndo);
    onClick("btn-seq-inf", doSeqStartInf);
    onClick("btn-seq-puzzles-70", () => {
      doMountPuzzles170();
    });
    $("pub")?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && seqPub.active) {
        ev.preventDefault();
        doSeqCommit();
      }
    });
    refreshSeqStatus();
    onClick("btn-priv-plus", () => nudgePriv(1n));
    onClick("btn-priv-minus", () => nudgePriv(-1n));
    onClick("btn-priv-rand", () => randomPrivFull());
    onClick("btn-priv-rand-range", () => randomPrivRange());
    $("priv-step")?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        nudgePriv(ev.shiftKey ? -1n : 1n);
      }
    });
    for (const id of ["priv-lo", "priv-hi"]) {
      $(id)?.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          randomPrivRange();
        }
      });
    }
    onClick("btn-pin-priv", () => doPin("priv"));
    onClick("btn-pin-pub", () => doPin("pub"));
    onClick("btn-pin-priv-sb", () => doPin("priv"));
    onClick("btn-pin-pub-sb", () => doPin("pub"));
    onClick("btn-rel-refresh", () => refreshRelations());
    onClick("btn-hist-clear", () => {
      if (!confirm("Clear all private-key history?")) return;
      clearHistory();
      histPage = 0;
      refreshHistory(0);
      flash("History cleared.", "info");
    });
    onClick("btn-bal-refresh", () => {
      const d = lastDerivedForBal || refreshDerived();
      if (d) refreshAddressBalances(d, { forceRefresh: true });
    });
    onClick("btn-bal-force", () => {
      const d = lastDerivedForBal || refreshDerived();
      if (d) refreshAddressBalances(d, { forceRefresh: true });
    });
    ["priv", "pub"].forEach((id) => {
      $(id)?.addEventListener("change", () => {
        refreshRelations();
        if (id === "priv") {
          refreshDerived();
          rememberPriv($("priv").value, "edit");
        }
      });
    });
    $("priv")?.addEventListener("input", () => {
      clearTimeout(refreshDerived._t);
      refreshDerived._t = setTimeout(() => refreshDerived(), 600);
    });
    onClick("btn-clear", () => {
      chain = [];
      rev = null;
      revSum = null;
      lastForward = null;
      const wasSeq = seqPub.active;
      seqPub = createSeqPubSession();
      seqPub.active = wasSeq;
      closeChainModal();
      renderChain();
      clearBitrows();
      setDetail("");
      refreshSeqStatus();
      flash(wasSeq ? "Chain cleared (seq stays ON)." : "Chain cleared.", "info");
    });
    onClick("btn-add-row", () => {
      readChainFromDom();
      chain.push(emptyRow({ label: "manual" }));
      activeId = chain[chain.length - 1].id;
      renderChain();
    });

    document.querySelectorAll("#chain-toolbar [data-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        readChainFromDom();
        chainView = btn.dataset.view === "full" ? "full" : "cards";
        renderChain();
      });
    });
    document.querySelectorAll("#chain-toolbar [data-filt]").forEach((btn) => {
      btn.addEventListener("click", () => {
        readChainFromDom();
        const f = btn.dataset.filt;
        chainFilter =
          f === "mul" || f === "add" || f === "both" || f === "all" ? f : "all";
        renderChain();
      });
    });

    ensureModalOnBody();
    // delegação: clique no card (mesmo após re-render)
    $("chain")?.addEventListener("click", (ev) => {
      const card = ev.target?.closest?.(".chain-card");
      if (!card || !card.dataset.id) return;
      ev.preventDefault();
      openChainModal(card.dataset.id);
    });
    $("chain-modal")?.addEventListener("click", (ev) => {
      const t = ev.target;
      if (t && t.closest && t.closest("[data-act='close-modal']")) {
        readChainFromDom();
        closeChainModal();
      }
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && modalRowId) {
        readChainFromDom();
        closeChainModal();
      }
    });

    document.querySelectorAll(".copy-btn").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.copy;
        copyText($(id)?.value ?? "");
      };
    });

    onClick("demo1", () => {
      $("priv").value = "1";
      doForward();
    });
    onClick("demo135", () => {
      $("priv").value = "6d9392a16883f90903d5f78da57af07eb2";
      doForward();
    });
    onClick("demoRev1", () => {
      $("pub").value =
        "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
      $("maxbit").value = "0";
      $("indices").value = "0";
      doRevInit();
      doApplyIndices();
    });

    fillCurveSpecFields();
    setVal("spec-algo-name", "Double-and-Add MSB-first");
    setVal("spec-algo-dir", "—");
    setVal("spec-algo-rule", algoForwardSpec().join("\n"));
    setVal(
      "spec-algo-why-d",
      "Always — each bit requires a Double before deciding Add."
    );
    setVal("spec-algo-why-a", "Only when bit[i]=1 in scalar k.");

    refreshPins();
    refreshHistory(0);
    refreshDerived();
    initToolsPanel();
    setChainContextProvider(() => ({ chain, lastForward }));
    window.__eqirSetChain = setEqirChain;
    window.__eqirSetMode = setEqirMode;
    initEqirModules();
    chain = [emptyRow({ label: "paste a point and use ↓ / ↑", kind: "blank" })];
    renderChain();
  } catch (e) {
    console.error("ecc-lab boot failed", e);
    try {
      flash("boot failed: " + (e.message || e), "warn");
    } catch {
      /* ignore */
    }
  }
}

boot();
