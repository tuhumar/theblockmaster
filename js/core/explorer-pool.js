/**
 * Pool rotativo de explorers — preferir 1 request multi-address.
 * Retorno normalizado: { balance, balanceUnit, txIn, txOut, txTotal, raw, provider }
 *
 * Rotação + cooldown: provider que falha (429/403/5xx/abort) fica fora ~45–90s
 * pra consultas seguidas não martelarem a mesma fonte.
 */

const state = {
  btcIdx: 0,
  ethIdx: 0,
  bnbIdx: 0,
  lastBtcProvider: null,
  lastEthProvider: null,
  lastBnbProvider: null,
  /** @type {Map<string, number>} name → epoch ms until usable */
  cooldownUntil: new Map(),
};

const COOLDOWN_MS_SOFT = 45_000;
const COOLDOWN_MS_HARD = 90_000;
const GAP_MS = 120; // gap leve entre attempts / addrs

function nextIdx(i, n) {
  return (i + 1) % n;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function markCooldown(name, hard = false) {
  if (!name) return;
  const ms = hard ? COOLDOWN_MS_HARD : COOLDOWN_MS_SOFT;
  const until = Date.now() + ms;
  const prev = state.cooldownUntil.get(name) || 0;
  if (until > prev) state.cooldownUntil.set(name, until);
}

function isCooling(name) {
  const until = state.cooldownUntil.get(name) || 0;
  if (until <= Date.now()) {
    if (until) state.cooldownUntil.delete(name);
    return false;
  }
  return true;
}

function isHardBlockStatus(status) {
  return status === 429 || status === 403 || status === 418 || status === 503;
}

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs || 12000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json", ...(opts.headers || {}) },
    });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      err.hard = isHardBlockStatus(res.status);
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function satsToBtc(sats) {
  const n = Number(sats) || 0;
  return n / 1e8;
}

function fmtBtc(sats) {
  const b = satsToBtc(sats);
  if (b === 0) return "0";
  if (Math.abs(b) >= 1) return b.toFixed(8).replace(/\.?0+$/, "");
  return b.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

function fmtEth(weiHexOrNum) {
  let wei;
  if (typeof weiHexOrNum === "string" && weiHexOrNum.startsWith("0x")) {
    wei = BigInt(weiHexOrNum);
  } else if (typeof weiHexOrNum === "bigint") {
    wei = weiHexOrNum;
  } else {
    wei = BigInt(String(Math.trunc(Number(weiHexOrNum) || 0)));
  }
  const whole = wei / 10n ** 18n;
  const frac = wei % 10n ** 18n;
  const fs = frac.toString().padStart(18, "0").replace(/0+$/, "");
  return fs ? `${whole}.${fs}` : whole.toString();
}

function emptyStat(addr) {
  return {
    address: addr,
    balance: null,
    balanceUnit: "",
    txIn: null,
    txOut: null,
    txTotal: null,
    error: null,
    provider: null,
  };
}

function noteFail(name, err) {
  const hard =
    err?.hard ||
    isHardBlockStatus(err?.status) ||
    /429|403|rate|limit|blocked|cloudflare/i.test(String(err?.message || err || ""));
  markCooldown(name, hard);
}

/* ── BTC multi / batch providers ─────────────────────────── */

/** Blockchair multi dashboards (1 URL, vários addrs). */
async function btcBlockchairMulti(addrs) {
  const joined = addrs.map(encodeURIComponent).join(",");
  const url = `https://api.blockchair.com/bitcoin/dashboards/addresses/${joined}?limit=0`;
  const j = await fetchJson(url);
  if (!j?.data) throw new Error("blockchair: no data");
  const out = {};
  for (const addr of addrs) {
    const row = j.data[addr] || j.data[addr.toLowerCase()];
    const a = row?.address;
    if (!a) {
      out[addr] = { ...emptyStat(addr), error: "not found", provider: "blockchair" };
      continue;
    }
    const received = a.received ?? a.received_approximate ?? 0;
    const spent = a.spent ?? 0;
    const bal = a.balance ?? received - spent;
    out[addr] = {
      address: addr,
      balance: fmtBtc(bal),
      balanceUnit: "BTC",
      txIn: a.receiving_transaction_count ?? null,
      txOut: a.spending_transaction_count ?? null,
      txTotal: a.transaction_count ?? null,
      provider: "blockchair",
      error: null,
    };
  }
  return { provider: "blockchair", stats: out };
}

/** Blockchain.info multiaddr (1 URL). */
async function btcBlockchainInfoMulti(addrs) {
  const active = addrs.map(encodeURIComponent).join("|");
  const url = `https://blockchain.info/multiaddr?active=${active}&n=0&cors=true`;
  const j = await fetchJson(url);
  if (!Array.isArray(j?.addresses)) throw new Error("blockchain.info: formato");
  const byAddr = new Map();
  for (const a of j.addresses) byAddr.set(a.address, a);
  const out = {};
  for (const addr of addrs) {
    const a =
      byAddr.get(addr) ||
      [...byAddr.values()].find((x) => x.address === addr);
    if (!a) {
      out[addr] = {
        ...emptyStat(addr),
        error: "not found",
        provider: "blockchain.info",
      };
      continue;
    }
    out[addr] = {
      address: addr,
      balance: fmtBtc(a.final_balance),
      balanceUnit: "BTC",
      txIn: null,
      txOut: null,
      txTotal: a.n_tx ?? null,
      provider: "blockchain.info",
      error: null,
      _received: a.total_received,
      _sent: a.total_sent,
    };
  }
  return { provider: "blockchain.info", stats: out };
}

/** Blockchain.info /balance — mais leve que multiaddr. */
async function btcBlockchainInfoBalance(addrs) {
  const active = addrs.map(encodeURIComponent).join("|");
  const url = `https://blockchain.info/balance?active=${active}&cors=true`;
  const j = await fetchJson(url);
  if (!j || typeof j !== "object") throw new Error("blockchain.info/balance: formato");
  const out = {};
  for (const addr of addrs) {
    const a = j[addr] || j[addr.toLowerCase()];
    if (!a) {
      out[addr] = {
        ...emptyStat(addr),
        error: "not found",
        provider: "blockchain.info/balance",
      };
      continue;
    }
    out[addr] = {
      address: addr,
      balance: fmtBtc(a.final_balance),
      balanceUnit: "BTC",
      txIn: null,
      txOut: null,
      txTotal: a.n_tx ?? null,
      provider: "blockchain.info/balance",
      error: null,
    };
  }
  return { provider: "blockchain.info/balance", stats: out };
}

/** Esplora-compatible batch (mempool / blockstream / mirrors). */
function makeEsploraBatch(baseUrl, providerName) {
  const root = baseUrl.replace(/\/$/, "");
  return async function esploraBatch(addrs) {
    const results = await Promise.all(
      addrs.map(async (addr, i) => {
        if (i) await sleep(GAP_MS);
        const url = `${root}/address/${encodeURIComponent(addr)}`;
        const j = await fetchJson(url);
        const c = j.chain_stats || {};
        const m = j.mempool_stats || {};
        const funded = (c.funded_txo_sum || 0) + (m.funded_txo_sum || 0);
        const spent = (c.spent_txo_sum || 0) + (m.spent_txo_sum || 0);
        return [
          addr,
          {
            address: addr,
            balance: fmtBtc(funded - spent),
            balanceUnit: "BTC",
            txIn: (c.funded_txo_count || 0) + (m.funded_txo_count || 0),
            txOut: (c.spent_txo_count || 0) + (m.spent_txo_count || 0),
            txTotal: (c.tx_count || 0) + (m.tx_count || 0),
            provider: providerName,
            error: null,
          },
        ];
      })
    );
    return { provider: providerName, stats: Object.fromEntries(results) };
  };
}

/** Blockcypher — multi via `;` (até ~3–5 addrs). */
async function btcBlockcypherBatch(addrs) {
  // API free tolera poucos addrs por URL; fatia em grupos de 3
  const out = {};
  const chunkSize = 3;
  for (let i = 0; i < addrs.length; i += chunkSize) {
    if (i) await sleep(GAP_MS * 2);
    const chunk = addrs.slice(i, i + chunkSize);
    const joined = chunk.map(encodeURIComponent).join(";");
    const url = `https://api.blockcypher.com/v1/btc/main/addrs/${joined}`;
    const j = await fetchJson(url);
    const rows = Array.isArray(j) ? j : [j];
    for (let k = 0; k < chunk.length; k++) {
      const addr = chunk[k];
      const a = rows[k] || rows.find((r) => r?.address === addr);
      if (!a) {
        out[addr] = {
          ...emptyStat(addr),
          error: "not found",
          provider: "blockcypher",
        };
        continue;
      }
      out[addr] = {
        address: addr,
        balance: fmtBtc(a.balance ?? a.final_balance ?? 0),
        balanceUnit: "BTC",
        txIn: null,
        txOut: null,
        txTotal: a.n_tx ?? a.final_n_tx ?? null,
        provider: "blockcypher",
        error: null,
      };
    }
  }
  return { provider: "blockcypher", stats: out };
}

/** Bitaps balance endpoint. */
async function btcBitapsBatch(addrs) {
  const results = await Promise.all(
    addrs.map(async (addr, i) => {
      if (i) await sleep(GAP_MS);
      const url = `https://api.bitaps.com/btc/v1/blockchain/address/state/${encodeURIComponent(addr)}`;
      const j = await fetchJson(url);
      const d = j?.data || j;
      if (d?.balance == null && d?.confirmed_balance == null && d?.receivedAmount == null) {
        throw new Error("bitaps: formato");
      }
      const bal =
        d.balance ??
        d.confirmed_balance ??
        (d.receivedAmount != null && d.sentAmount != null
          ? d.receivedAmount - d.sentAmount
          : 0);
      return [
        addr,
        {
          address: addr,
          balance: fmtBtc(bal),
          balanceUnit: "BTC",
          txIn: d.receivedTxCount ?? null,
          txOut: d.sentTxCount ?? null,
          txTotal: d.txCount ?? d.transactions ?? null,
          provider: "bitaps",
          error: null,
        },
      ];
    })
  );
  return { provider: "bitaps", stats: Object.fromEntries(results) };
}

/** BTC.com chain API. */
async function btcBtcComBatch(addrs) {
  const results = await Promise.all(
    addrs.map(async (addr, i) => {
      if (i) await sleep(GAP_MS);
      const url = `https://chain.api.btc.com/v3/address/${encodeURIComponent(addr)}`;
      const j = await fetchJson(url);
      if (j?.err_no && j.err_no !== 0) throw new Error(j.err_msg || "btc.com error");
      const d = j?.data;
      if (!d) throw new Error("btc.com: no data");
      return [
        addr,
        {
          address: addr,
          balance: fmtBtc(d.balance ?? 0),
          balanceUnit: "BTC",
          txIn: null,
          txOut: null,
          txTotal: d.tx_count ?? null,
          provider: "btc.com",
          error: null,
        },
      ];
    })
  );
  return { provider: "btc.com", stats: Object.fromEntries(results) };
}

const BTC_POOL = [
  { name: "blockchain.info", run: btcBlockchainInfoMulti, multi: true },
  { name: "blockchain.info/balance", run: btcBlockchainInfoBalance, multi: true },
  { name: "blockchair", run: btcBlockchairMulti, multi: true },
  { name: "blockcypher", run: btcBlockcypherBatch, multi: true },
  {
    name: "mempool.space",
    run: makeEsploraBatch("https://mempool.space/api", "mempool.space"),
    multi: false,
  },
  {
    name: "mempool.emzy",
    run: makeEsploraBatch("https://mempool.emzy.de/api", "mempool.emzy"),
    multi: false,
  },
  {
    name: "mempool.bisq",
    run: makeEsploraBatch("https://mempool.bisq.services/api", "mempool.bisq"),
    multi: false,
  },
  {
    name: "mempool.b21",
    run: makeEsploraBatch("https://mempool.bitcoin-21.org/api", "mempool.b21"),
    multi: false,
  },
  {
    name: "blockstream",
    run: makeEsploraBatch("https://blockstream.info/api", "blockstream"),
    multi: false,
  },
  {
    name: "btcscan",
    run: makeEsploraBatch("https://btcscan.org/api", "btcscan"),
    multi: false,
  },
  { name: "bitaps", run: btcBitapsBatch, multi: false },
  { name: "btc.com", run: btcBtcComBatch, multi: false },
];

export async function fetchBtcStats(addrs) {
  const list = [...new Set((addrs || []).map((a) => String(a).trim()).filter(Boolean))];
  if (!list.length) return { provider: null, stats: {} };

  const n = BTC_POOL.length;
  let lastErr = null;
  let tried = 0;

  for (let attempt = 0; attempt < n; attempt++) {
    const i = (state.btcIdx + attempt) % n;
    const prov = BTC_POOL[i];
    if (isCooling(prov.name)) continue;
    tried++;
    if (tried > 1) await sleep(GAP_MS);
    try {
      const res = await prov.run(list);
      state.btcIdx = nextIdx(i, n);
      state.lastBtcProvider = res.provider;
      return res;
    } catch (e) {
      lastErr = e;
      noteFail(prov.name, e);
    }
  }

  // se todos em cooldown, tenta o próximo da fila mesmo assim
  if (!tried) {
    for (let attempt = 0; attempt < n; attempt++) {
      const i = (state.btcIdx + attempt) % n;
      const prov = BTC_POOL[i];
      try {
        const res = await prov.run(list);
        state.btcIdx = nextIdx(i, n);
        state.lastBtcProvider = res.provider;
        return res;
      } catch (e) {
        lastErr = e;
        noteFail(prov.name, e);
      }
    }
  }

  state.btcIdx = nextIdx(state.btcIdx, n);
  const fail = {};
  for (const a of list) {
    fail[a] = {
      ...emptyStat(a),
      error: lastErr?.message || "all BTC APIs failed",
    };
  }
  return { provider: null, stats: fail, error: lastErr?.message };
}

/* ── ETH / EVM providers ─────────────────────────────────── */

async function ethEthplorer(addr) {
  const url = `https://api.ethplorer.io/getAddressInfo/${encodeURIComponent(addr)}?apiKey=freekey`;
  const j = await fetchJson(url);
  if (j.error) throw new Error(String(j.error?.message || j.error));
  const bal = j.ETH?.balance;
  return {
    address: addr,
    balance: bal != null ? String(bal) : null,
    balanceUnit: "ETH",
    txIn: null,
    txOut: null,
    txTotal: j.countTxs ?? null,
    provider: "ethplorer",
    error: null,
  };
}

async function evmBlockscout(addr, host, unit, providerName) {
  const url = `https://${host}/api/v2/addresses/${encodeURIComponent(addr)}`;
  const j = await fetchJson(url);
  const wei = j.coin_balance != null ? BigInt(j.coin_balance) : null;
  const txIn = j.transactions_to_count ?? null;
  const txOut = j.transactions_from_count ?? null;
  const txTotal =
    j.transactions_count ??
    (txIn != null && txOut != null ? txIn + txOut : null);
  return {
    address: addr,
    balance: wei != null ? fmtEth(wei) : null,
    balanceUnit: unit,
    txIn,
    txOut,
    txTotal,
    provider: providerName,
    error: null,
  };
}

async function evmRpcBalance(addr, rpcUrl, name, unit) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [addr, "latest"],
      }),
    });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      err.hard = isHardBlockStatus(res.status);
      throw err;
    }
    const j = await res.json();
    if (j.error) throw new Error(j.error.message || "rpc error");
    return {
      address: addr,
      balance: fmtEth(j.result),
      balanceUnit: unit,
      txIn: null,
      txOut: null,
      txTotal: null,
      provider: name,
      error: null,
    };
  } finally {
    clearTimeout(t);
  }
}

function rpcProv(name, url, unit) {
  return { name, run: (a) => evmRpcBalance(a, url, name, unit) };
}

const ETH_ADDR_POOL = [
  {
    name: "eth.blockscout",
    run: (a) => evmBlockscout(a, "eth.blockscout.com", "ETH", "eth.blockscout"),
  },
  { name: "ethplorer", run: (a) => ethEthplorer(a) },
  rpcProv("eth.llamarpc", "https://eth.llamarpc.com", "ETH"),
  rpcProv("eth.publicnode", "https://ethereum.publicnode.com", "ETH"),
  rpcProv("eth.cloudflare", "https://cloudflare-eth.com", "ETH"),
  rpcProv("eth.1rpc", "https://1rpc.io/eth", "ETH"),
  rpcProv("eth.drpc", "https://eth.drpc.org", "ETH"),
  rpcProv("eth.meowrpc", "https://eth.meowrpc.com", "ETH"),
  rpcProv("eth.ankr", "https://rpc.ankr.com/eth", "ETH"),
  rpcProv("eth.merkle", "https://eth.merkle.io", "ETH"),
  rpcProv("eth.tenderly", "https://ethereum.gateway.tenderly.co", "ETH"),
  rpcProv("eth.flashbots", "https://rpc.flashbots.net", "ETH"),
];

const BNB_ADDR_POOL = [
  rpcProv("bsc-dataseed", "https://bsc-dataseed.binance.org", "BNB"),
  rpcProv("bsc-dataseed1", "https://bsc-dataseed1.binance.org", "BNB"),
  rpcProv("bsc-dataseed2", "https://bsc-dataseed2.binance.org", "BNB"),
  rpcProv("bsc-dataseed3", "https://bsc-dataseed3.binance.org", "BNB"),
  rpcProv("bsc-dataseed4", "https://bsc-dataseed4.binance.org", "BNB"),
  rpcProv("bsc.defibit", "https://bsc-dataseed1.defibit.io", "BNB"),
  rpcProv("bsc.ninicoin", "https://bsc-dataseed1.ninicoin.io", "BNB"),
  rpcProv("bsc.publicnode", "https://bsc.publicnode.com", "BNB"),
  rpcProv("bsc.1rpc", "https://1rpc.io/bnb", "BNB"),
  rpcProv("bsc.meowrpc", "https://bsc.meowrpc.com", "BNB"),
  rpcProv("bsc.llamarpc", "https://binance.llamarpc.com", "BNB"),
  rpcProv("bsc.ankr", "https://rpc.ankr.com/bsc", "BNB"),
  rpcProv("bsc.drpc", "https://bsc.drpc.org", "BNB"),
  {
    name: "bsc.blockscout",
    run: (a) => evmBlockscout(a, "bsc.blockscout.com", "BNB", "bsc.blockscout"),
  },
];

async function fetchEvmPoolStats(addrs, pool, idxKey, lastKey, label) {
  const list = [...new Set((addrs || []).map((a) => String(a).trim()).filter(Boolean))];
  if (!list.length) return { provider: null, stats: {} };

  const out = {};
  let used = null;
  const n = pool.length;

  for (let ai = 0; ai < list.length; ai++) {
    const addr = list[ai];
    if (ai) await sleep(GAP_MS);
    let ok = false;
    let lastErr = null;
    let tried = 0;

    for (let attempt = 0; attempt < n; attempt++) {
      const i = (state[idxKey] + attempt) % n;
      const prov = pool[i];
      if (isCooling(prov.name)) continue;
      tried++;
      if (tried > 1) await sleep(GAP_MS);
      try {
        out[addr] = await prov.run(addr);
        state[idxKey] = nextIdx(i, n);
        used = out[addr].provider;
        ok = true;
        break;
      } catch (e) {
        lastErr = e;
        noteFail(prov.name, e);
      }
    }

    if (!ok) {
      // ignora cooldown e tenta todos uma vez
      for (let attempt = 0; attempt < n; attempt++) {
        const i = (state[idxKey] + attempt) % n;
        const prov = pool[i];
        try {
          out[addr] = await prov.run(addr);
          state[idxKey] = nextIdx(i, n);
          used = out[addr].provider;
          ok = true;
          break;
        } catch (e) {
          lastErr = e;
          noteFail(prov.name, e);
        }
      }
    }

    if (!ok) {
      out[addr] = {
        ...emptyStat(addr),
        error: lastErr?.message || `${label} APIs failed`,
      };
    }
  }
  state[lastKey] = used;
  return { provider: used, stats: out };
}

/** ETH pool rotativo. */
export async function fetchEthStats(addrs) {
  return fetchEvmPoolStats(addrs, ETH_ADDR_POOL, "ethIdx", "lastEthProvider", "ETH");
}

/** BNB / BSC pool rotativo (mesmo addr 0x, chain distinta). */
export async function fetchBnbStats(addrs) {
  return fetchEvmPoolStats(addrs, BNB_ADDR_POOL, "bnbIdx", "lastBnbProvider", "BNB");
}

const CACHE_KEY = "ecc-lab-addr-stats-v1";

function loadCacheStore() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function saveCacheStore(store) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(store));
  } catch {
    /* quota / private mode */
  }
}

function cacheKey(chain, addr) {
  return `${chain}:${String(addr).trim()}`;
}

export function getCachedStat(chain, addr) {
  const store = loadCacheStore();
  const row = store[cacheKey(chain, addr)];
  if (!row || !row.stat) return null;
  return {
    ...row.stat,
    fromCache: true,
    cachedAt: row.savedAt || null,
    provider: row.stat.provider ? `${row.stat.provider}+cache` : "cache",
  };
}

export function putCachedStat(chain, addr, stat) {
  if (!addr || !stat || stat.error) return;
  const store = loadCacheStore();
  store[cacheKey(chain, addr)] = {
    savedAt: new Date().toISOString(),
    stat: {
      address: stat.address || addr,
      balance: stat.balance,
      balanceUnit: stat.balanceUnit,
      txIn: stat.txIn,
      txOut: stat.txOut,
      txTotal: stat.txTotal,
      provider: stat.provider,
      error: null,
    },
  };
  saveCacheStore(store);
}

function putMany(chain, statsObj) {
  for (const [addr, stat] of Object.entries(statsObj || {})) {
    putCachedStat(chain, addr, stat);
  }
}

function takeFromCache(chain, list, statsObj) {
  let hits = 0;
  let oldest = null;
  const need = [];
  for (const a of list) {
    const c = getCachedStat(chain, a);
    if (c) {
      statsObj[a] = c;
      hits++;
      if (c.cachedAt && (!oldest || c.cachedAt < oldest)) oldest = c.cachedAt;
    } else need.push(a);
  }
  return { hits, oldest, need };
}

/**
 * Consulta única: BTC + ETH + BNB (pools) + cache local.
 * @param {{btc?:string[], eth?:string[], bnb?:string[], forceRefresh?:boolean}} opts
 */
export async function fetchAllAddressStats({
  btc = [],
  eth = [],
  bnb = [],
  forceRefresh = false,
} = {}) {
  const btcList = [...new Set((btc || []).map((a) => String(a).trim()).filter(Boolean))];
  const ethList = [...new Set((eth || []).map((a) => String(a).trim()).filter(Boolean))];
  const bnbList = [...new Set((bnb || []).map((a) => String(a).trim()).filter(Boolean))];

  const btcStats = {};
  const ethStats = {};
  const bnbStats = {};
  let btcNeed = [];
  let ethNeed = [];
  let bnbNeed = [];
  let cacheHits = 0;
  let oldestCache = null;

  if (!forceRefresh) {
    const b = takeFromCache("btc", btcList, btcStats);
    const e = takeFromCache("eth", ethList, ethStats);
    const n = takeFromCache("bnb", bnbList, bnbStats);
    btcNeed = b.need;
    ethNeed = e.need;
    bnbNeed = n.need;
    cacheHits = b.hits + e.hits + n.hits;
    oldestCache = [b.oldest, e.oldest, n.oldest].filter(Boolean).sort()[0] || null;
  } else {
    btcNeed = btcList;
    ethNeed = ethList;
    bnbNeed = bnbList;
  }

  const anyListed = btcList.length + ethList.length + bnbList.length > 0;
  const allCached =
    !forceRefresh &&
    btcNeed.length === 0 &&
    ethNeed.length === 0 &&
    bnbNeed.length === 0 &&
    anyListed;

  let btcProvider = allCached ? "cache" : null;
  let ethProvider = allCached ? "cache" : null;
  let bnbProvider = allCached ? "cache" : null;

  if (btcNeed.length || ethNeed.length || bnbNeed.length) {
    const [btcRes, ethRes, bnbRes] = await Promise.all([
      btcNeed.length ? fetchBtcStats(btcNeed) : Promise.resolve({ provider: null, stats: {} }),
      ethNeed.length ? fetchEthStats(ethNeed) : Promise.resolve({ provider: null, stats: {} }),
      bnbNeed.length ? fetchBnbStats(bnbNeed) : Promise.resolve({ provider: null, stats: {} }),
    ]);
    Object.assign(btcStats, btcRes.stats || {});
    Object.assign(ethStats, ethRes.stats || {});
    Object.assign(bnbStats, bnbRes.stats || {});
    putMany("btc", btcRes.stats);
    putMany("eth", ethRes.stats);
    putMany("bnb", bnbRes.stats);
    btcProvider = btcRes.provider || state.lastBtcProvider || btcProvider;
    ethProvider = ethRes.provider || state.lastEthProvider || ethProvider;
    bnbProvider = bnbRes.provider || state.lastBnbProvider || bnbProvider;
  }

  const needLeft = btcNeed.length + ethNeed.length + bnbNeed.length;
  const fromCache = allCached
    ? true
    : cacheHits > 0 && needLeft > 0
      ? "partial"
      : false;

  return {
    btc: { provider: btcProvider, stats: btcStats },
    eth: { provider: ethProvider, stats: ethStats },
    bnb: { provider: bnbProvider, stats: bnbStats },
    meta: {
      btcProvider: btcProvider || state.lastBtcProvider,
      ethProvider: ethProvider || state.lastEthProvider,
      bnbProvider: bnbProvider || state.lastBnbProvider,
      fromCache,
      cacheHits,
      cachedAt: oldestCache,
      forceRefresh: !!forceRefresh,
    },
  };
}

export function getPoolState() {
  const now = Date.now();
  const cooling = [];
  for (const [name, until] of state.cooldownUntil.entries()) {
    if (until > now) cooling.push({ name, msLeft: until - now });
    else state.cooldownUntil.delete(name);
  }
  return {
    btcIdx: state.btcIdx,
    ethIdx: state.ethIdx,
    bnbIdx: state.bnbIdx,
    lastBtcProvider: state.lastBtcProvider,
    lastEthProvider: state.lastEthProvider,
    lastBnbProvider: state.lastBnbProvider,
    btcPool: BTC_POOL.map((p) => p.name),
    ethPool: ETH_ADDR_POOL.map((p) => p.name),
    bnbPool: BNB_ADDR_POOL.map((p) => p.name),
    cooling,
  };
}
