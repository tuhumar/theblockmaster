/**
 * Sidebars: pins (direita) + relações/colisões + histórico priv (esquerda).
 * Persistência local — localStorage, zero rede.
 */

const PINS_KEY = "ecc-lab-pins-v1";
const HIST_KEY = "ecc-lab-priv-history-v1";
const HIST_PAGE_SIZE = 10;
const HIST_MAX = 500;

export function loadPins() {
  try {
    const raw = localStorage.getItem(PINS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function savePins(pins) {
  localStorage.setItem(PINS_KEY, JSON.stringify(pins));
}

export function uid() {
  return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * @param {{kind:'priv'|'pub', value:string, name?:string}} item
 */
export function addPin(item) {
  const pins = loadPins();
  const value = String(item.value || "").trim();
  if (!value) throw new Error("empty value for pin");
  const name =
    (item.name && String(item.name).trim()) ||
    `${item.kind} · ${shortVal(value)}`;
  const pin = {
    id: uid(),
    kind: item.kind === "priv" ? "priv" : "pub",
    value,
    name,
    at: new Date().toISOString(),
  };
  pins.unshift(pin);
  savePins(pins);
  return pin;
}

export function renamePin(id, name) {
  const pins = loadPins();
  const p = pins.find((x) => x.id === id);
  if (!p) return null;
  p.name = String(name || "").trim() || p.name;
  savePins(pins);
  return p;
}

export function removePin(id) {
  savePins(loadPins().filter((x) => x.id !== id));
}

export function shortVal(v, n = 14) {
  const s = String(v);
  if (s.length <= n) return s;
  return s.slice(0, 8) + "…" + s.slice(-4);
}

function normPrivHex(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/^0x/, "")
    .replace(/^0+/, "") || "0";
}

export function loadHistory() {
  try {
    const raw = localStorage.getItem(HIST_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveHistory(items) {
  try {
    localStorage.setItem(HIST_KEY, JSON.stringify(items));
  } catch (e) {
    // quota / private mode — não derruba o lab
    console.warn("ecc-lab history save failed", e);
  }
}

/** Só private keys. Dedup consecutivo; mais recente primeiro. */
export function pushPrivHistory(privHex, note = "") {
  const value = normPrivHex(privHex);
  if (!value || value === "0") return null;
  const items = loadHistory();
  if (items[0] && normPrivHex(items[0].value) === value) {
    // já é o topo — só atualiza timestamp/nota
    items[0].at = new Date().toISOString();
    if (note) items[0].note = String(note);
    saveHistory(items);
    return items[0];
  }
  const entry = {
    id: "h" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    value,
    note: String(note || ""),
    at: new Date().toISOString(),
  };
  items.unshift(entry);
  if (items.length > HIST_MAX) items.length = HIST_MAX;
  saveHistory(items);
  return entry;
}

export function clearHistory() {
  saveHistory([]);
}

export function removeHistoryEntry(id) {
  saveHistory(loadHistory().filter((x) => x.id !== id));
}

export function historyPageCount(total = loadHistory().length) {
  return Math.max(1, Math.ceil(total / HIST_PAGE_SIZE));
}

/**
 * @param {HTMLElement} container
 * @param {{page:number, statusById?:Record<string,string>, onLoad:(e)=>void, onRemove:(id)=>void, onPage:(p)=>void}} opts
 * status: 'funded' | 'used' | 'empty' | ''
 */
export function renderHistoryList(container, {
  page = 0,
  statusById = {},
  onLoad,
  onRemove,
  onPage,
}) {
  const items = loadHistory();
  const pages = historyPageCount(items.length);
  const p = Math.min(Math.max(0, page | 0), pages - 1);
  const start = p * HIST_PAGE_SIZE;
  const slice = items.slice(start, start + HIST_PAGE_SIZE);

  container.innerHTML = "";
  if (!slice.length) {
    container.innerHTML = `<div class="sb-empty">No private keys in history.</div>`;
  } else {
    slice.forEach((e) => {
      const st = statusById[e.id] || "";
      const el = document.createElement("div");
      el.className = "hist-card" + (st === "funded" || st === "used" ? ` ${st}` : "");
      el.dataset.id = e.id;
      el.dataset.status = st || "empty";
      const when = e.at
        ? new Date(e.at).toLocaleString(undefined, {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        : "";
      const flag =
        st === "funded"
          ? "balance"
          : st === "used"
            ? "had tx"
            : st === "empty"
              ? "empty"
              : "…";
      el.innerHTML = `
        <div class="hist-top">
          <span class="hist-at">${esc(when)}</span>
          <span class="hist-flag">${esc(flag)}</span>
          <button type="button" class="ghost sm hist-del" title="remove">✕</button>
        </div>
        <div class="hist-val" title="${esc(e.value)}">${esc(shortVal(e.value, 26))}</div>
        ${e.note ? `<div class="rel-type">${esc(e.note)}</div>` : ""}
        <div class="hist-actions">
          <button type="button" class="ghost sm hist-load">load</button>
          <button type="button" class="ghost sm hist-copy">⧉</button>
        </div>`;
      el.querySelector(".hist-del").onclick = () => onRemove?.(e.id);
      el.querySelector(".hist-load").onclick = () => onLoad?.(e);
      el.querySelector(".hist-copy").onclick = () => {
        navigator.clipboard?.writeText(e.value);
      };
      container.appendChild(el);
    });
  }

  const label = document.getElementById("hist-page-label");
  if (label) label.textContent = `${p + 1} / ${pages}`;
  const prev = document.getElementById("btn-hist-prev");
  const next = document.getElementById("btn-hist-next");
  if (prev) {
    prev.disabled = p <= 0;
    prev.onclick = () => onPage?.(p - 1);
  }
  if (next) {
    next.disabled = p >= pages - 1;
    next.onclick = () => onPage?.(p + 1);
  }
  return { page: p, slice };
}

export { HIST_PAGE_SIZE };

/**
 * Analisa cadeia + pins + priv/pub atuais → relações / colisões / repetições.
 */
export function analyzeRelations({ chain, pins, priv, pub, Gcompressed }) {
  const findings = [];
  const byCompressed = new Map(); // value → [L#]
  const byX = new Map();
  const byY = new Map();
  const byLambda = new Map();

  function bump(map, key, loc) {
    if (!key) return;
    const k = String(key).toLowerCase();
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(loc);
  }

  (chain || []).forEach((row, i) => {
    const loc = `L${i + 1}${row.kind ? "·" + row.kind : ""}`;
    bump(byCompressed, row.compressed, loc);
    bump(byX, row.x, loc);
    bump(byY, row.y, loc);
    bump(byLambda, row.lambda, loc);
  });

  function collectDupes(map, label) {
    for (const [val, locs] of map) {
      if (locs.length < 2) continue;
      findings.push({
        type: "repeat",
        severity: val === "∞" || val === "inf" ? "info" : "warn",
        title: `${label} repeated ×${locs.length}`,
        detail: `${shortVal(val, 22)}`,
        locs: locs.join(", "),
      });
    }
  }

  collectDupes(byCompressed, "compressed");
  collectDupes(byX, "x");
  collectDupes(byY, "y");
  collectDupes(byLambda, "λ");

  // ∞ appearances
  const infLocs = byCompressed.get("∞") || byCompressed.get("inf") || [];
  if (infLocs.length) {
    findings.push({
      type: "relation",
      severity: "info",
      title: `O (∞) appears ×${infLocs.length}`,
      detail: "point at infinity",
      locs: infLocs.join(", "),
    });
  }

  // equals G
  if (Gcompressed) {
    const gKey = Gcompressed.toLowerCase();
    const gLocs = byCompressed.get(gKey) || [];
    if (gLocs.length) {
      findings.push({
        type: "relation",
        severity: "ok",
        title: `point = G (generator)`,
        detail: shortVal(Gcompressed, 20),
        locs: gLocs.join(", "),
      });
    }
    if (pub && pub.trim().toLowerCase() === gKey) {
      findings.push({
        type: "relation",
        severity: "ok",
        title: "Current Public = G",
        detail: "k≡1 (if forward complete)",
        locs: "Pub field",
      });
    }
  }

  // consecutive identical compressed
  for (let i = 1; i < (chain || []).length; i++) {
    const a = (chain[i - 1].compressed || "").trim().toLowerCase();
    const b = (chain[i].compressed || "").trim().toLowerCase();
    if (a && b && a === b) {
      findings.push({
        type: "collision",
        severity: "warn",
        title: `L${i} → L${i + 1} same point`,
        detail: shortVal(a, 22),
        locs: `L${i}, L${i + 1}`,
      });
    }
  }

  // pin collisions vs chain / fields
  const pinList = pins || [];
  for (const pin of pinList) {
    const v = (pin.value || "").trim().toLowerCase().replace(/^0x/, "");
    if (!v) continue;

    if (pin.kind === "pub") {
      const locs = byCompressed.get(v) || [];
      if (locs.length) {
        findings.push({
          type: "pin↔chain",
          severity: "ok",
          title: `pin «${pin.name}» on chain`,
          detail: shortVal(pin.value, 20),
          locs: locs.join(", "),
        });
      }
      if ((pub || "").trim().toLowerCase().replace(/^0x/, "") === v) {
        findings.push({
          type: "pin↔field",
          severity: "ok",
          title: `pin «${pin.name}» = current Pub`,
          detail: shortVal(pin.value, 20),
          locs: "Pub",
        });
      }
    }
    if (pin.kind === "priv") {
      const pv = (priv || "").trim().toLowerCase().replace(/^0x/, "").replace(/^0+/, "") || "0";
      const pinNorm = v.replace(/^0+/, "") || "0";
      if (pv === pinNorm) {
        findings.push({
          type: "pin↔field",
          severity: "ok",
          title: `pin «${pin.name}» = current Priv`,
          detail: shortVal(pin.value, 20),
          locs: "Priv",
        });
      }
    }
  }

  // duplicate pins
  const pinVals = new Map();
  for (const pin of pinList) {
    const k = pin.kind + ":" + (pin.value || "").trim().toLowerCase();
    if (!pinVals.has(k)) pinVals.set(k, []);
    pinVals.get(k).push(pin.name);
  }
  for (const [, names] of pinVals) {
    if (names.length < 2) continue;
    findings.push({
      type: "collision",
      severity: "warn",
      title: `duplicate pins ×${names.length}`,
      detail: names.join(" · "),
      locs: "sidebar pin",
    });
  }

  if (!findings.length) {
    findings.push({
      type: "—",
      severity: "muted",
      title: "no repeats / collisions detected",
      detail: "run Priv→Pub or edit the chain",
      locs: "",
    });
  }

  // sort: warn first
  const order = { warn: 0, ok: 1, info: 2, muted: 3 };
  findings.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));
  return findings;
}

export function renderPinsList(container, {
  onLoad,
  onRename,
  onRemove,
  focusId,
}) {
  const pins = loadPins();
  container.innerHTML = "";
  if (!pins.length) {
    container.innerHTML = `<div class="sb-empty">No pins. Use 📌 Priv / 📌 Pub.</div>`;
    return;
  }
  pins.forEach((pin) => {
    const el = document.createElement("div");
    el.className = "pin-card" + (pin.id === focusId ? " focus" : "");
    el.dataset.id = pin.id;
    el.innerHTML = `
      <div class="pin-top">
        <span class="pin-kind ${pin.kind}">${pin.kind}</span>
        <input class="pin-name" type="text" value="${esc(pin.name)}" title="pin name" />
        <button type="button" class="ghost sm pin-del" title="remove">✕</button>
      </div>
      <div class="pin-val mono" title="${esc(pin.value)}">${esc(shortVal(pin.value, 28))}</div>
      <div class="pin-actions">
        <button type="button" class="ghost sm pin-load">load</button>
        <button type="button" class="ghost sm pin-copy">⧉</button>
      </div>`;
    const nameInp = el.querySelector(".pin-name");
    nameInp.addEventListener("change", () => onRename(pin.id, nameInp.value));
    nameInp.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        nameInp.blur();
      }
    });
    el.querySelector(".pin-del").onclick = () => onRemove(pin.id);
    el.querySelector(".pin-load").onclick = () => onLoad(pin);
    el.querySelector(".pin-copy").onclick = () => {
      navigator.clipboard?.writeText(pin.value);
    };
    container.appendChild(el);
    if (pin.id === focusId) {
      requestAnimationFrame(() => {
        nameInp.focus();
        nameInp.select();
      });
    }
  });
}

export function renderRelationsList(container, findings) {
  container.innerHTML = "";
  findings.forEach((f) => {
    const el = document.createElement("div");
    el.className = `rel-card sev-${f.severity}`;
    el.innerHTML = `
      <div class="rel-type">${esc(f.type)}</div>
      <div class="rel-title">${esc(f.title)}</div>
      <div class="rel-detail mono">${esc(f.detail || "")}</div>
      ${f.locs ? `<div class="rel-locs">${esc(f.locs)}</div>` : ""}`;
    container.appendChild(el);
  });
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
