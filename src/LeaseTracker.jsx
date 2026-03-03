import { useReducer, useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "./auth";
import { SettingsModal } from "./SettingsModal";
import { supabase } from "./supabase";
import { Layers, LogOut, UserPlus, X, ChevronsUpDown, ChevronUp, ChevronDown, Pencil, Check, Trash2, Sun, Moon, ChevronLeft, ChevronRight, AlignJustify, Settings, CalendarRange, Printer, Download } from "lucide-react";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

const GRID = "2fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1.5fr 56px";

const COLUMNS = [
  { label: "Name",       key: "name"                },
  { label: "Year",       key: "year"                },
  { label: "Model",      key: "model"               },
  { label: "Incentive",  key: "privateIncentive"    },
  { label: "Expiration", key: "incentiveExp"        },
  { label: "Inc. Mo.",   key: "incentiveExp"        },
  { label: "Lease End",  key: "leaseEnd"            },
  { label: "Mo. Left",   key: "leaseEnd"            },
  { label: "Status",     key: "status"              },
  { label: "",           key: null                  },
];

const DATE_KEYS   = new Set(["incentiveExp", "leaseEnd"]);

const STATUSES = [
  { key: "early",         label: "Early",        color: "#5a6a88", order: 0 },
  { key: "attempting",    label: "Attempting",   color: "#4a7eb8", order: 1 },
  { key: "contact",       label: "Contact",      color: "#6870b8", order: 2 },
  { key: "waiting",       label: "Waiting",      color: "#8878a8", order: 3 },
  { key: "success",       label: "Success",      color: "#3a8a6a", order: 4 },
  { key: "lease_return",  label: "Lease Return", short: "Return",  color: "#3a7a9a", order: 5 },
  { key: "buyout",        label: "Buy Out",      short: "Buy Out", color: "#4a5ab0", order: 6 },
  { key: "lost",          label: "Lost Deal",    short: "Lost",    color: "#9a4050", order: 7 },
];

const STATUS_MAP = new Map(STATUSES.map(s => [s.key, s]));
function statusMeta(key) {
  return STATUS_MAP.get(key) || STATUSES[0];
}
const EMPTY_FORM = {
  name: "", year: "", model: "", trim: "", bank: "",
  term: "", milesYearly: "", milesTerm: "", currentMiles: "",
  monthlyPayment: "", downPayment: "", tradeEquity: "",
  leaseEnd: "", privateIncentive: "", incentiveExp: "", status: "early", hasAccident: false,
};

// ── HELPERS ───────────────────────────────────────────────────────────────────

function uid() { return crypto.randomUUID(); }


// Title-case a name: "CHRISTINA BARILE" → "Christina Barile"
function titleCase(str) {
  return (str || "").toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).trim();
}

// ── DMS paste parser ──────────────────────────────────────────────────────────
function parseDMS(raw) {
  // Normalize: remove CR, tabs to spaces, collapse multiple spaces, trim each line
  const normalized = raw.replace(/\r/g, "").replace(/\t/g, " ").replace(/ +/g, " ");
  const lines = normalized.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  const full  = lines.join("\n");

  const get = (re) => { const m = full.match(re); return m ? m[1].trim() : ""; };
  const num = (s)  => s ? s.replace(/[$,\s]/g, "") : "";

  // Name: find line containing "Purchase Information", take everything before first "-"
  const nameLine = lines.find(l => /Purchase Information/i.test(l)) || "";
  const name = nameLine.split(/\s*-\s*/)[0].trim();

  // Vehicle: text between "Vehicle Purchased:" and "VIN:"
  const vpM = full.match(/Vehicle Purchased:\s*(.+?)(?:VIN:|$)/m);
  const vehicleRaw = vpM ? vpM[1].replace(/\s+/g, " ").trim() : "";
  const year = (vehicleRaw.match(/(20\d{2}|19\d{2})/) || [])[1] || "";
  const MODELS = ["Golf R","GTI","GLI","Atlas Cross Sport","Atlas","Tiguan","Taos","Jetta","Arteon","ID.4","ID.Buzz"];
  let model = "";
  for (const m of MODELS) { if (vehicleRaw.toLowerCase().includes(m.toLowerCase())) { model = m; break; } }

  // Trim: look for known trim codes after the model name
  const TRIMS = ["SE Black","SEL Premium R-Line Turbo","SEL Premium R-Line","SEL Premium","SEL","SE Tech","SE","S","GLI","R-Line"];
  let trim = "";
  for (const t of TRIMS) {
    // Match trim as a whole word, not inside a longer word
    const trimRe = new RegExp("\\b" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
    if (trimRe.test(vehicleRaw)) { trim = t; break; }
  }

  // VIN: first 17-char VIN after "VIN:"
  const vin = get(/VIN:\s*([A-HJ-NPR-Z0-9]{17})/i);

  // Odometer: first "Mileage: <number>" line
  const milM = full.match(/(?:^|\n)Mileage:\s*(\d+)/i);
  const currentMiles = milM ? milM[1] : "";

  // Term
  const term = get(/Term:\s*(\d+)/);

  // Miles/year
  const milesYearly = num(get(/Total Lease Mileage:\s*(\d[\d,]*)/i));
  const milesTerm = (milesYearly && term)
    ? String(Math.round((parseInt(milesYearly) / 12) * parseInt(term))) : "";

  // Financials
  const monthlyPayment = num(get(/Monthly Payment:\s*\$?([\d,]+\.?\d*)/));
  const dpRaw = num(get(/Down Payment:\s*\$?([\d,]+\.?\d*)/));
  const downPayment = dpRaw || "0";

  // Trade equity
  const allowance = parseFloat(num(get(/Total Trade Allowance:\s*\$?([\d,]+\.?\d*)/))) || 0;
  const payoff    = parseFloat(num(get(/Total Trade Payoff:\s*\$?([\d,]+\.?\d*)/)))    || 0;
  const tradeEquity = allowance > 0 ? String((allowance - payoff).toFixed(2)) : "";

  // Lease end
  const leaseEndRaw = get(/End of Term Date:\s*([\d/]+)/);
  let leaseEnd = "";
  if (leaseEndRaw) {
    try {
      const d = new Date(leaseEndRaw);
      if (!isNaN(d)) leaseEnd = d.toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
    } catch { leaseEnd = leaseEndRaw; }
  }

  // Bank: stop at next CamelCase field (e.g. "Back Gross", "Dealer Profit")
  const bankRaw = get(/Financed Through:\s*([A-Za-z0-9 ]+?)(?=[A-Z][a-z]+ [A-Z]|\n|$)/);
  const BANKS = { "VCIL":"VW Credit","VW CREDIT":"VW Credit","ALLY":"Ally","AFFINITY":"Affinity","CAL":"Cal","CASH":"" };
  const bank = BANKS[(bankRaw||"").trim().toUpperCase()] ?? bankRaw.trim();

  const isLease = /Lease Turn-in/i.test(full);

  return { name, year, model, trim, vin, term, milesYearly, milesTerm, currentMiles,
           monthlyPayment, downPayment, tradeEquity, leaseEnd, bank, isLease };
}


function smartParseDate(str) {
  if (!str || str === "—") return null;
  const s = str.trim();

  // Month+Day only (e.g. "Mar 31", "March 31") — must check BEFORE native parse
  // because new Date("Mar 31") returns year 2001
  const monthDayMatch = s.match(/^([a-zA-Z]+)\s+(\d{1,2})$/);
  if (monthDayMatch) {
    const now = new Date();
    let d = new Date(`${monthDayMatch[1]} ${monthDayMatch[2]} ${now.getFullYear()}`);
    if (isNaN(d)) return null;
    if (d < now) d = new Date(`${monthDayMatch[1]} ${monthDayMatch[2]} ${now.getFullYear() + 1}`);
    return d;
  }

  // Month+Year only (e.g. "Apr 2026") — use last day of that month
  const monthYearMatch = s.match(/^([a-zA-Z]+)\s+(\d{4})$/);
  if (monthYearMatch) {
    const mo = new Date(`${monthYearMatch[1]} 1 ${monthYearMatch[2]}`).getMonth();
    const yr = parseInt(monthYearMatch[2]);
    if (!isNaN(mo) && !isNaN(yr)) return new Date(yr, mo + 1, 0);
  }

  // Full date — native parse (handles "Apr 15, 2026", "2026-04-15", etc.)
  const d = new Date(s);
  if (!isNaN(d)) return d;

  return null;
}

// "September 15 2026" | "9/15/2026" | "9/15/26" | "Apr 2026" → "Apr 15 2026" or "Apr 2026"
function normalizeLeaseEnd(raw) {
  if (!raw || !raw.trim()) return "—";
  const s = raw.trim();
  if (s === "—") return "—";

  // Numeric full date: 9/15/2026 or 9/15/26
  const numFull = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (numFull) {
    let yr = parseInt(numFull[3]);
    if (yr < 100) yr += 2000;
    const d = new Date(yr, parseInt(numFull[1]) - 1, parseInt(numFull[2]));
    if (!isNaN(d)) return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  // Numeric month/year only: 9/2026
  const numMY = s.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (numMY) {
    const mo = parseInt(numMY[1]) - 1;
    const yr = parseInt(numMY[2]);
    return `${MONTH_SHORT[mo]} ${yr}`;
  }

  // Try native Date parse
  const d = new Date(s);
  if (!isNaN(d)) return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  // "Month YYYY" — month/year only
  const myMatch = s.match(/^([a-zA-Z]+)\s+(\d{4})$/);
  if (myMatch) {
    const idx = MONTH_NAMES.findIndex(m => m.startsWith(myMatch[1].toLowerCase()));
    if (idx !== -1) return `${MONTH_SHORT[idx]} ${myMatch[2]}`;
  }

  return s;
}

// "March 31" | "march 31" | "3/31" | "3-31" → "Mar 31"
function normalizeIncentiveExp(raw) {
  if (!raw || !raw.trim()) return "—";
  const s = raw.trim();
  if (s === "—") return "—";

  const numMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (numMatch) {
    const mo  = parseInt(numMatch[1]) - 1;
    const day = parseInt(numMatch[2]);
    if (mo >= 0 && mo <= 11) return `${MONTH_SHORT[mo]} ${day}`;
  }

  const parts = s.split(/[\s,]+/);
  if (parts.length >= 2) {
    const moStr = parts[0].toLowerCase().replace(/\./g, "");
    const day   = parseInt(parts[1]);
    if (!isNaN(day)) {
      const idx = MONTH_NAMES.findIndex(m => m.startsWith(moStr));
      if (idx !== -1) return `${MONTH_SHORT[idx]} ${day}`;
    }
  }

  return s;
}

function parseDateVal(str) {
  const d = smartParseDate(str);
  return d ? d.getTime() : Infinity;
}

function calcMonthsLeft(dateStr) {
  const target = smartParseDate(dateStr);
  if (!target) return 0;
  const now  = new Date();
  const daysLeft = Math.ceil((target - now) / 86400000);
  if (daysLeft <= 0) return 0;
  if (daysLeft < 30) return 0; // under 30 days → show days instead
  const diff = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
  return Math.max(0, diff);
}

function calcDaysLeft(dateStr) {
  const target = smartParseDate(dateStr);
  if (!target) return 0;
  return Math.max(0, Math.ceil((target - new Date()) / 86400000));
}
function rawDaysLeft(dateStr) {
  const target = smartParseDate(dateStr);
  if (!target) return 0;
  return Math.ceil((target - new Date()) / 86400000);
}

function formatTimeLeft(months, days, raw) {
  if (raw !== undefined && raw < 0) return "Expired";
  if (months < 1) return days <= 0 ? "Today" : `${days} ${days === 1 ? "day" : "days"}`;
  return `${months} ${months === 1 ? "month" : "months"}`;
}

function monthsColor(m, dayMode = false) {
  if (dayMode) {
    if (m === 0) return "#1d4ed8";
    if (m <= 3)  return "#2563eb";
    if (m <= 5)  return "#3b82f6";
    return "#9ca3af";
  }
  if (m === 0) return "#7aa4e0";
  if (m <= 3)  return "#5a84c0";
  if (m <= 5)  return "#4a6ea8";
  return "#5a6a88";
}

function formatMiles(n) { return Number(n).toLocaleString(); }

// ── Mileage pace calculator ────────────────────────────────────────────────────
// Returns { projectedTotal, overage, pace, status }
// status: "over" | "warning" | "ok" | null (not enough data)
function calcMileagePace(c) {
  const { term, milesTerm, currentMiles, leaseEnd } = c;
  if (!term || !milesTerm || !currentMiles || !leaseEnd || leaseEnd === "—") return null;

  const leaseEndDate = smartParseDate(leaseEnd);
  if (!leaseEndDate) return null;

  // Back-calculate lease start from end - term months
  const leaseStart = new Date(leaseEndDate);
  leaseStart.setMonth(leaseStart.getMonth() - term);

  const now = new Date();
  const totalMs    = leaseEndDate - leaseStart;
  const elapsedMs  = now - leaseStart;
  if (elapsedMs <= 0 || totalMs <= 0) return null;

  const elapsedFraction = Math.min(elapsedMs / totalMs, 1);
  const expectedMiles   = Math.round(elapsedFraction * milesTerm);
  const projectedTotal  = elapsedFraction > 0
    ? Math.round((currentMiles / elapsedFraction))
    : 0;
  const overage         = projectedTotal - milesTerm;
  const monthsLeft      = calcMonthsLeft(leaseEnd);
  const daysLeft        = calcDaysLeft(leaseEnd);

  // "over" = already past allowance or projected to exceed
  // "warning" = on pace to exceed AND more than 3 months left (actionable window)
  const alreadyOver = currentMiles > milesTerm;
  const projectedOver = projectedTotal > milesTerm;

  let status = "ok";
  if (alreadyOver || (projectedOver && monthsLeft <= 1)) {
    status = "over";
  } else if (projectedOver && monthsLeft > 1) {
    status = "warning";
  }

  return { projectedTotal, overage, expectedMiles, currentMiles, milesTerm, status, monthsLeft };
}



// ── NORMALIZERS ───────────────────────────────────────────────────────────────

const MONTH_NAMES = ["january","february","march","april","may","june","july","august","september","october","november","december"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// "$1,500" | "1500" | "1,500.00" → 1500
function normalizeCurrency(raw) {
  if (!raw && raw !== 0) return 0;
  const n = parseFloat(String(raw).replace(/[$,\s]/g, ""));
  return isNaN(n) ? 0 : n;
}

// "10,000" | "10000" | "10k" → 10000
function normalizeMiles(raw) {
  if (!raw && raw !== 0) return 0;
  const s = String(raw).replace(/,/g, "").trim().toLowerCase();
  if (s.endsWith("k")) return Math.round(parseFloat(s) * 1000);
  const n = parseInt(s);
  return isNaN(n) ? 0 : n;
}

// "36 months" | "36mo" | "36" → 36
function normalizeTerm(raw) {
  if (!raw) return 0;
  const n = parseInt(String(raw).replace(/[^0-9]/g, ""));
  return isNaN(n) ? 0 : n;
}

// "2022" | "22" → 2022
function normalizeYear(raw) {
  if (!raw) return new Date().getFullYear();
  let n = parseInt(String(raw).replace(/[^0-9]/g, ""));
  if (isNaN(n)) return new Date().getFullYear();
  if (n < 100) n += 2000;
  return n;
}

// Apply all normalizers to a raw form object
function normalizeForm(form) {
  return {
    ...form,
    year:            normalizeYear(form.year),
    term:            normalizeTerm(form.term),
    leaseEnd:        normalizeLeaseEnd(form.leaseEnd),
    incentiveExp:    normalizeIncentiveExp(form.incentiveExp),
    monthlyPayment:  normalizeCurrency(form.monthlyPayment),
    downPayment:     normalizeCurrency(form.downPayment),
    tradeEquity:     normalizeCurrency(form.tradeEquity),
    privateIncentive:normalizeCurrency(form.privateIncentive),
    milesYearly:     normalizeMiles(form.milesYearly),
    milesTerm:       normalizeMiles(form.milesTerm),
    currentMiles:    normalizeMiles(form.currentMiles),
  };
}

function buildCustomer(raw) {
  const form      = normalizeForm(raw);
  const leaseEnd  = form.leaseEnd;
  const incentiveExp = form.incentiveExp;
  return {
    id:                  uid(),
    name:                raw.name.trim(),
    year:                form.year,
    model:               raw.model?.trim()  || "—",
    trim:                raw.trim?.trim()   || "—",
    bank:                raw.bank?.trim()   || "—",
    term:                form.term,
    milesYearly:         form.milesYearly,
    milesTerm:           form.milesTerm,
    currentMiles:        form.currentMiles,
    monthlyPayment:      form.monthlyPayment,
    downPayment:         form.downPayment,
    tradeEquity:         form.tradeEquity,
    leaseEnd,
    privateIncentive:    form.privateIncentive,
    incentiveExp,
    status:              raw.status || "early",
  };
}


// ── REDUCER ───────────────────────────────────────────────────────────────────

function loadState() {
  return { customers: [], notes: {} };
}

function reducer(state, action) {
  switch (action.type) {
    case "LOAD_CUSTOMERS":  return { ...state, customers: action.customers };
    case "LOAD_NOTES":      return { ...state, notes: action.notes };
    case "ADD_CUSTOMER":    return { ...state, customers: [...state.customers, { ...action.customer, updatedAt: new Date().toISOString() }] };
    case "UPDATE_CUSTOMER": return { ...state, customers: state.customers.map(c => c.id === action.id ? { ...c, ...action.updates, updatedAt: new Date().toISOString() } : c) };
    case "DELETE_CUSTOMER": return { ...state, customers: state.customers.filter(c => c.id !== action.id) };
    case "SAVE_NOTE": {
      const existing = state.notes[action.id]?.history || [];
      return { ...state, notes: { ...state.notes, [action.id]: { history: [{ text: action.text, savedAt: action.savedAt, id: action.entryId }, ...existing] } } };
    }
    case "DELETE_NOTE_ENTRY": {
      const filtered = (state.notes[action.id]?.history || []).filter(e => e.id !== action.entryId);
      return { ...state, notes: { ...state.notes, [action.id]: { history: filtered } } };
    }
    case "SET_STATUS":      return { ...state, customers: state.customers.map(c => c.id === action.id ? { ...c, status: action.status, updatedAt: new Date().toISOString() } : c) };
    default:                return state;
  }
}

// ── STYLES ────────────────────────────────────────────────────────────────────

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', sans-serif; height: 100vh; overflow: hidden; background: #0c0c0e; -webkit-font-smoothing: antialiased; }

  /* ── WINDOWS FONT RENDERING — bump thin weights for ClearType ── */
  .app.win body, .app.win,
  .app.win .cell-year, .app.win .cell-model, .app.win .cell-trim,
  .app.win .cell-miles, .app.win .cell-lease-end, .app.win .cell-incentive-exp,
  .app.win .months-badge, .app.win .cell-incentive,
  .app.win .detail-lead-name, .app.win .detail-lead-sub,
  .app.win .detail-meta-value, .app.win .detail-meta-label,
  .app.win .note-entry-text, .app.win .notes-saved-at,
  .app.win .nav-item, .app.win .modal-name-input,
  .app.win .modal-field input, .app.win .modal-field select,
  .app.win .meta-input, .app.win .toast-detail,
  .app.win .tl-card-vehicle, .app.win .tl-card-time,
  .app.win .stat-label, .app.win .dir-role, .app.win .dir-phone {
    font-weight: 500;
    -webkit-font-smoothing: auto;
  }
  .app.win .cell-name, .app.win .tl-card-name { font-weight: 600; }
  .app.win .detail-lead-name { font-weight: 500; }
  body:has(.app.day) { background: #f2f3f5; }

  .app {
    --bg-body:        #131720;
    --bg-sidebar:     #131720;
    --bg-panel:       #181d28;
    --bg-card:        #1c2130;
    --bg-input:       #161b25;
    --bg-input-meta:  #131720;
    --bg-hover:       #1f2535;
    --bg-hover-sm:    #252c3d;
    --bg-hover-cell:  #1f2535;
    --bg-confirm:     #1c2130;
    --bg-row-selected: #1a2640;
    --bg-status-opt-hover: #1f2535;
    --border-main:    #232a3a;
    --border-sidebar: #1e2432;
    --border-input:   #2e3648;
    --border-input-focus: #4a8fd4;
    --border-card:    #252d3e;
    --border-confirm: #2a3244;
    --border-status:  #2e3648;
    --text-primary:   #e6eaf5;
    --text-secondary: #6b7a99;
    --text-tertiary:  #4a5670;
    --text-muted:     #364050;
    --text-dimmer:    #2a3040;
    --text-cell:      #e6eaf5;
    --text-name:      #e6eaf5;
    --text-nav:       #6b7a99;
    --text-nav-count: #8896b4;
    --text-section:   #364050;
    --scrollbar:      #2a3244;
    --shadow-panel:   rgba(0,0,0,0.5);
    --shadow-modal:   rgba(0,0,0,0.7);
    --overlay-bg:     rgba(0,0,0,0.6);
    --overlay-bg2:    rgba(0,0,0,0.75);
    --btn-primary-bg:   #2a4a7a;
    --btn-primary-hover: #2e5488;
    --btn-primary-text:  #c8daf4;
    display: flex; height: 100vh; overflow: hidden; background: var(--bg-body); color: var(--text-primary);
  }

  /* ── LIGHT THEME — Mercury faithful ── */
  .app.day {
    --bg-body:         #f2f3f5;
    --bg-sidebar:      #f2f3f5;
    --bg-panel:        #ffffff;
    --bg-card:         #ffffff;
    --bg-input:        #f5f6f8;
    --bg-input-meta:   #f0f1f5;
    --bg-hover:        #f5f6f8;
    --bg-hover-sm:     #e4e6ed;
    --bg-hover-cell:   #f5f6f8;
    --bg-confirm:      #ffffff;
    --bg-row-selected: #f0f2fc;
    --bg-status-opt-hover: #f5f6f8;
    --border-main:     #eceef2;
    --border-sidebar:  #eceef2;
    --border-input:    #e0e2ea;
    --border-input-focus: #6366f1;
    --border-card:     #e8eaef;
    --border-confirm:  #e8eaef;
    --border-status:   #e0e2ea;
    --text-primary:    #111827;
    --text-secondary:  #6b7280;
    --text-tertiary:   #9ca3af;
    --text-muted:      #b0b3be;
    --text-dimmer:     #d1d5db;
    --text-cell:       #1f2937;
    --text-name:       #111827;
    --text-nav:        #6b7280;
    --text-nav-count:  #9ca3af;
    --text-section:    #9ca3af;
    --scrollbar:       #e0e2ea;
    --shadow-panel:    rgba(0,0,0,0.0);
    --shadow-modal:    rgba(0,0,0,0.08);
    --overlay-bg:      rgba(17,24,39,0.12);
    --overlay-bg2:     rgba(17,24,39,0.2);
    --btn-primary-bg:   #4f46e5;
    --btn-primary-hover: #4338ca;
    --btn-primary-text:  #ffffff;
  }

  @keyframes fadeIn      { from { opacity: 0; } to { opacity: 1; } }
  @keyframes modalIn     { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
  @keyframes statusFlash { 0% { opacity: 1; } 30% { opacity: 0.4; transform: scale(0.94); } 100% { opacity: 1; transform: scale(1); } }
  @keyframes modalOut    { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.97); } }
  @keyframes panelIn     { from { opacity: 0; transform: translateX(16px) scale(0.99); } to { opacity: 1; transform: translateX(0) scale(1); } }
  @keyframes panelOut    { from { opacity: 1; transform: translateX(0) scale(1); } to { opacity: 0; transform: translateX(16px) scale(0.99); } }
  @keyframes panelContentIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

  /* ── SIDEBAR ── */
  .sidebar {
    width: 220px; min-width: 220px;
    background: var(--bg-sidebar);
    display: flex; flex-direction: column;
    transition: width 0.2s cubic-bezier(0.16,1,0.3,1), min-width 0.2s cubic-bezier(0.16,1,0.3,1);
    overflow: hidden;
    border-right: 1px solid var(--border-main);
  }
  .sidebar.collapsed { width: 52px; min-width: 52px; }
  .app.day .sidebar { border-right: 1px solid var(--border-main); }

  .sidebar-brand { padding: 18px 16px 10px; display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .sidebar-brand-mark { width: 22px; height: 22px; border-radius: 6px; background: linear-gradient(135deg, #2a5caa 0%, #1a3a6e 100%); display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 2px 8px rgba(42,92,170,0.4); }
  .sidebar-brand-text { font-size: 11px; font-weight: 700; letter-spacing: 1.8px; text-transform: uppercase; color: var(--text-primary); opacity: 0.7; }
  .app.day .sidebar-brand-mark { box-shadow: 0 2px 8px rgba(42,92,170,0.25); }
  .sidebar.collapsed .sidebar-brand-text { display: none; }
  .sidebar.collapsed .sidebar-brand { justify-content: center; padding: 16px 10px 8px; }
  .sidebar-header { padding: 4px 10px 8px 14px; display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
  .profile-btn { display: flex; align-items: center; gap: 9px; cursor: pointer; user-select: none; padding: 5px 7px; border-radius: 7px; transition: background 0.1s; flex: 1; min-width: 0; overflow: hidden; }
  .profile-btn:hover { background: var(--bg-hover-sm); }
  .sidebar-collapse-btn { display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 5px; border: none; background: transparent; color: var(--text-secondary); cursor: pointer; flex-shrink: 0; transition: background 0.1s, color 0.1s; }
  .sidebar-collapse-btn:hover { background: var(--bg-hover-sm); color: var(--text-primary); }

  .sidebar.collapsed .profile-name { display: none; }
  .sidebar.collapsed .sidebar-section-label { display: none; }
  .sidebar.collapsed .nav-item-label { display: none; }
  .sidebar.collapsed .nav-count { display: none; }
  .sidebar.collapsed .theme-toggle { display: none; }
  .sidebar.collapsed .sidebar-footer > .nav-item { display: none; }
  .sidebar.collapsed .nav-item { justify-content: center; padding: 6px; }
  .sidebar.collapsed .nav-icon { opacity: 0.7; width: auto; }
  .sidebar.collapsed .profile-btn { justify-content: center; flex: none; padding: 5px; }
  .sidebar.collapsed .sidebar-header { justify-content: center; padding: 10px; }
  .sidebar.collapsed .sidebar-footer { justify-content: center; }

  .profile-avatar {
    width: 28px; height: 28px;
    background: linear-gradient(135deg, #1e2d4a 0%, #252d3e 100%);
    border-radius: 7px;
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 700; color: #7aa4e0; letter-spacing: 0.3px; flex-shrink: 0;
    border: 1px solid #2a3a5a;
  }
  .app.day .profile-avatar { background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); color: #2563eb; border-color: #bfdbfe; }
  .profile-name { font-size: 13px; font-weight: 500; color: var(--text-primary); letter-spacing: -0.1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .sidebar-body { flex: 1; padding: 6px 8px 8px; display: flex; flex-direction: column; gap: 1px; }
  .sidebar-section-label { font-size: 10px; color: var(--text-section); letter-spacing: 0.4px; text-transform: uppercase; padding: 0 8px; margin-bottom: 3px; margin-top: 10px; font-weight: 600; }
  .sidebar-section-label:first-child { margin-top: 2px; }

  .nav-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; cursor: pointer; font-size: 13px; color: var(--text-nav); font-weight: 400; transition: background 0.08s, color 0.08s; user-select: none; }
  .nav-item:hover { background: var(--bg-hover-sm); color: var(--text-cell); }
  .nav-item.active { font-weight: 500; }
  /* Day mode active */
  .app.day .nav-item.active { background: rgba(0,0,0,0.04); color: #111827; box-shadow: none; }
  /* Night mode active */
  .app:not(.day) .nav-item.active { background: var(--bg-hover); color: var(--text-primary); }
  /* Active indicator */
  .nav-item.active { position: relative; }
  .nav-item.active::before { content: ""; position: absolute; left: 0; top: 50%; transform: translateY(-50%); width: 2.5px; height: 14px; border-radius: 0 2px 2px 0; background: var(--border-input-focus); }
  .app.day .nav-item.active::before { background: #4f46e5; }

  .nav-icon { display: flex; align-items: center; justify-content: center; opacity: 0.45; width: 16px; flex-shrink: 0; }
  .nav-item.active .nav-icon { opacity: 0.65; }
  .nav-count { margin-left: auto; font-size: 10.5px; color: var(--text-nav-count); background: var(--bg-hover-sm); border-radius: 20px; padding: 1px 7px; font-weight: 500; }
  .app.day .nav-count { background: transparent; color: #b0b3be; }

  .sidebar-footer { padding: 8px 8px 14px; display: flex; align-items: center; justify-content: space-between; }

  .theme-toggle { display: flex; align-items: center; gap: 6px; padding: 4px 6px; cursor: pointer; border-radius: 5px; transition: background 0.1s; flex-shrink: 0; }
  .theme-icon { transition: transform 0.4s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s; }
  .theme-icon.spinning { transform: rotate(180deg); }
  .theme-toggle:hover { background: var(--bg-hover-sm); }

  .toggle-track { width: 28px; height: 16px; border-radius: 20px; background: var(--border-input); border: 1px solid var(--border-status); transition: background 0.2s, border-color 0.2s; flex-shrink: 0; position: relative; }
  .toggle-track.on { background: #1e2a3a; border-color: #2a3a4a; }
  .app.day .toggle-track.on { background: #d1d5db; border-color: #c4c8d0; }
  .app.day .toggle-track.on .toggle-thumb { background: #6b7280; }
  .toggle-thumb { position: absolute; top: 2px; left: 2px; width: 10px; height: 10px; border-radius: 50%; background: var(--text-secondary); transition: transform 0.2s cubic-bezier(0.16,1,0.3,1), background 0.2s; }
  .toggle-track.on .toggle-thumb { transform: translateX(12px); background: #fff; }

  /* ── MAIN LAYOUT ── */
  .main-wrapper { flex: 1; display: flex; align-items: stretch; padding: 10px 10px 10px 0; overflow: hidden; background: var(--bg-body); position: relative; }

  .list-panel {
    flex: 1; display: flex; flex-direction: column; overflow: hidden;
    background: var(--bg-panel); border-radius: 10px;
    border: 1px solid var(--border-card);
    box-shadow: 0 0 0 1px var(--shadow-panel), 0 8px 32px var(--shadow-panel);
  }
  .app.day .list-panel {
    border: 1px solid #e8eaef;
    box-shadow: 0 1px 4px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.02);
  }

  /* ── TOPBAR ── */
  .topbar { display: flex; align-items: center; gap: 8px; padding: 0 16px; height: 48px; border-bottom: 1px solid var(--border-main); flex-shrink: 0; border-radius: 10px 10px 0 0; background: var(--bg-panel); }
  .topbar-title { font-size: 15px; font-weight: 600; color: var(--text-primary); letter-spacing: -0.3px; }
  .topbar-divider { width: 1px; height: 16px; background: var(--border-main); flex-shrink: 0; }
  .spacer { flex: 1; }

  .search-box { background: var(--bg-input); border: 1px solid var(--border-input); border-radius: 6px; padding: 0 10px; height: 28px; font-size: 12px; font-family: 'Inter', sans-serif; color: var(--text-cell); width: 160px; outline: none; transition: border-color 0.2s, width 0.25s cubic-bezier(0.16,1,0.3,1), box-shadow 0.2s; }
  .search-box:focus { border-color: var(--border-input-focus); color: var(--text-primary); width: 240px; }
  .toolbar-btn { display: inline-flex; align-items: center; padding: 0 10px; height: 28px; font-size: 12px; border: 1px solid var(--border-input); border-radius: 6px; background: transparent; color: var(--text-secondary); cursor: pointer; white-space: nowrap; }
  .toolbar-btn:hover { border-color: var(--border-input-focus); color: var(--text-primary); }
  .app.day .search-box:focus { box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
  .search-box::placeholder { color: var(--text-secondary); }
  .kbd-hint { font-size: 10px; color: var(--text-tertiary); letter-spacing: 0.1px; display: flex; align-items: center; gap: 4px; user-select: none; }
  .kbd { display: inline-flex; align-items: center; justify-content: center; height: 16px; min-width: 16px; padding: 0 4px; background: var(--bg-hover-sm); border: 1px solid var(--border-input); border-radius: 3px; font-size: 9px; font-family: inherit; color: var(--text-secondary); }

  .btn-primary { display: flex; align-items: center; gap: 6px; background: var(--btn-primary-bg); color: var(--btn-primary-text); border: none; border-radius: 7px; padding: 0 13px; height: 30px; font-size: 12.5px; font-family: 'Inter', sans-serif; font-weight: 500; cursor: pointer; transition: background 0.15s; white-space: nowrap; letter-spacing: -0.1px; }
  .btn-primary:hover { background: var(--btn-primary-hover); }

  .btn-secondary { display: flex; align-items: center; gap: 6px; background: transparent; color: var(--text-secondary); border: 1px solid var(--border-input); border-radius: 7px; padding: 5px 12px; font-size: 12px; font-family: 'Inter', sans-serif; font-weight: 500; cursor: pointer; transition: background 0.1s, color 0.1s; white-space: nowrap; }
  .btn-secondary:hover { background: var(--bg-hover); color: var(--text-primary); border-color: var(--border-status); }

  /* Density */
  .density-btn { display: flex; align-items: center; gap: 5px; padding: 0 9px; height: 28px; border-radius: 6px; border: 1px solid var(--border-input); background: transparent; font-size: 12px; font-family: "Inter", sans-serif; color: var(--text-secondary); cursor: pointer; transition: background 0.1s, color 0.1s; }
  .density-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
  .density-menu { position: absolute; top: calc(100% + 6px); right: 0; background: var(--bg-card); border: 1px solid var(--border-card); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); z-index: 50; overflow: hidden; min-width: 130px; animation: modalIn 0.12s cubic-bezier(0.16,1,0.3,1); }
  .density-option { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; font-size: 12.5px; font-family: "Inter", sans-serif; color: var(--text-cell); cursor: pointer; transition: background 0.08s; }
  .density-option:hover { background: var(--bg-hover); }
  .density-option.active { color: var(--text-primary); font-weight: 500; }

  /* ── STATS BAR ── */
  .stats-bar { display: flex; border-bottom: 1px solid var(--border-main); flex-shrink: 0; background: var(--bg-panel); }
  .stat-item { flex: 1; padding: 14px 18px 12px; border-right: 1px solid var(--border-main); display: flex; flex-direction: column; gap: 4px; cursor: pointer; transition: background 0.12s; user-select: none; position: relative; }
  .stat-item::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: transparent; transition: background 0.15s; border-radius: 0; }
  .stat-item.active::before { background: currentColor; }
  .stat-item:hover { background: var(--bg-hover); }
  .stat-item:last-child { border-right: none; }
  .stat-value { font-size: 22px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.8px; line-height: 1.1; }
  .stat-label { font-size: 10.5px; color: var(--text-secondary); letter-spacing: 0.1px; font-weight: 500; }

  /* ── TABLE ── */
  .table-wrap { flex: 1; overflow-y: auto; overflow-x: auto; }
  .table-wrap::-webkit-scrollbar { width: 4px; height: 4px; }
  .table-wrap::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 3px; }

  .col-headers { display: grid; grid-template-columns: ${GRID}; padding: 0 14px; height: 32px; align-items: center; border-bottom: 1px solid var(--border-main); position: sticky; top: 0; background: var(--bg-panel); z-index: 10; min-width: 0; }
  .col-header { font-size: 10px; color: var(--text-tertiary); font-weight: 600; letter-spacing: 0.4px; text-transform: uppercase; display: flex; align-items: center; gap: 4px; cursor: pointer; user-select: none; transition: color 0.1s; height: 100%; }
  .col-header:hover { color: var(--text-primary); }
  .col-header.active { color: var(--border-input-focus); }
  .app:not(.day) .col-header.active { color: #7aa4e0; }
  .sort-icon { display: flex; align-items: center; opacity: 0.5; flex-shrink: 0; }
  .col-header.active .sort-icon { opacity: 1; }

  .customer-row { display: grid; grid-template-columns: ${GRID}; padding: 0 14px; height: 46px; align-items: center; border-bottom: 1px solid var(--border-sidebar); cursor: pointer; transition: background 0.08s; user-select: none; }
  .density-compact .customer-row { height: 34px; }
  .customer-row:hover { background: var(--bg-hover); box-shadow: inset 3px 0 0 var(--border-input); }
  .customer-row.row-urgent:hover, .customer-row.row-soon:hover, .customer-row.row-expired:hover { box-shadow: none; }
  .customer-row:hover .row-actions { opacity: 1; pointer-events: all; }
  .customer-row.selected { background: var(--bg-row-selected); }
  /* Urgency left-border on rows */
  .customer-row.row-urgent  { border-left: 2px solid #7aa4e0; padding-left: 12px; }
  .customer-row.row-soon    { border-left: 2px solid #4a6ea8; padding-left: 12px; }
  .customer-row.row-expired { border-left: 2px solid #6b3a3a; padding-left: 12px; opacity: 0.6; }
  .app.day .customer-row.row-expired { border-left-color: #dc2626; }
  .app.day .customer-row.row-urgent { border-left-color: #4f46e5; }
  .app.day .customer-row.row-soon   { border-left-color: #818cf8; }

  .row-actions { position: absolute; right: 0; top: 50%; transform: translateY(-50%); display: flex; align-items: center; gap: 4px; opacity: 0; pointer-events: none; transition: opacity 0.12s; z-index: 5; }
  .row-action-btn { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 5px; border: 1px solid var(--border-input); background: var(--bg-panel); cursor: pointer; color: var(--text-secondary); transition: all 0.1s; }
  .row-action-btn:hover { background: var(--bg-hover); border-color: var(--border-status); color: var(--text-cell); }
  .row-action-btn.danger:hover { background: #221414; border-color: #3a1a1a; color: #a83838; }
  .app.day .row-action-btn.danger:hover { background: #fef2f2; border-color: #fecaca; color: #dc2626; }

  /* Cell styles */
  .cell-name    { font-size: 13px; color: var(--text-name); font-weight: 500; letter-spacing: -0.1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px; }
  .notes-count-badge { font-size: 9.5px; font-weight: 500; background: var(--border-main); color: var(--text-secondary); border-radius: 10px; padding: 1px 6px; flex-shrink: 0; letter-spacing: 0; }
  .app.day .notes-count-badge { background: #e8eaef; color: #6b7280; }
  .cell-year    { font-size: 12px; color: var(--text-cell); font-weight: 400; }
  .cell-model   { font-size: 12.5px; color: var(--text-primary); font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cell-trim    { font-size: 12px; color: var(--text-cell); font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cell-miles   { font-size: 12px; color: var(--text-secondary); }
  .cell-incentive { font-size: 12.5px; font-weight: 500; transition: opacity 0.1s; }
  .cell-incentive.none { opacity: 0.25; }
  .cell-incentive-exp  { font-size: 12px; color: var(--text-cell); display: flex; align-items: center; gap: 5px; }
  .miles-warn-dot { width: 5px; height: 5px; border-radius: 50%; display: inline-block; vertical-align: middle; margin-right: 4px; flex-shrink: 0; }
  .incentive-warn-dot { width: 5px; height: 5px; border-radius: 50%; background: #f59e0b; flex-shrink: 0; box-shadow: 0 0 5px #f59e0b88; display: inline-block; vertical-align: middle; }
  .cell-lease-end { font-size: 12px; color: var(--text-cell); }
  .months-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 500; }
  .status-pill { display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px; border-radius: 6px; font-size: 11px; font-weight: 500; letter-spacing: 0.1px; border: 1px solid transparent; white-space: nowrap; }

  /* ── STATUS SELECTOR ── */
  .status-selector { padding: 12px 18px 14px; border-bottom: 1px solid var(--border-main); flex-shrink: 0; }
  .status-selector-label { font-size: 10px; color: var(--text-secondary); font-weight: 500; letter-spacing: 0.3px; text-transform: uppercase; margin-bottom: 8px; }
  .status-options { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; }
  .status-option { display: flex; align-items: center; justify-content: center; gap: 5px; padding: 5px 6px; border-radius: 6px; font-size: 11px; font-weight: 500; border: 1px solid var(--border-status); background: transparent; cursor: pointer; color: var(--text-secondary); transition: all 0.12s; font-family: 'Inter', sans-serif; white-space: nowrap; }
  .status-option:hover { color: var(--text-cell); background: var(--bg-status-opt-hover); }
  .status-option.active { border-color: transparent; color: #fff; font-weight: 600; }
  .status-option.flashing { animation: statusFlash 0.3s ease; }
  .status-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .status-cell { display: flex; align-items: center; gap: 5px; flex-wrap: nowrap; overflow: hidden; }
  .signal-tag { display: inline-flex; align-items: center; font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 6px; white-space: nowrap; letter-spacing: 0.1px; flex-shrink: 0; border: 1px solid transparent; }
  .signal-tag.miles { background: rgba(248,113,113,0.12); color: #f87171; border: 1px solid rgba(248,113,113,0.25); }
  .signal-tag.miles-warn { background: rgba(251,191,36,0.12); color: #f59e0b; border: 1px solid rgba(251,191,36,0.25); }
  .signal-tag.accident { background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); }
  .app.day .signal-tag.miles { background: rgba(220,38,38,0.08); color: #dc2626; border-color: rgba(220,38,38,0.2); }
  .app.day .signal-tag.miles-warn { background: rgba(217,119,6,0.08); color: #d97706; border-color: rgba(217,119,6,0.2); }
  .app.day .signal-tag.accident { background: rgba(220,38,38,0.08); color: #dc2626; border-color: rgba(220,38,38,0.2); }
  .accident-toggle { display: flex; align-items: center; gap: 8px; padding: 11px 16px; cursor: pointer; user-select: none; }
  .accident-checkbox { width: 14px; height: 14px; border-radius: 3px; border: 1px solid var(--border-input); background: var(--bg-input); display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background 0.1s, border-color 0.1s; }
  .accident-checkbox.checked { background: rgba(239,68,68,0.2); border-color: #ef4444; }
  .accident-label { font-size: 12px; color: var(--text-secondary); }
  .accident-toggle:hover .accident-label { color: var(--text-primary); }

  /* ── EMPTY STATE ── */
  .empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 40px; }
  .empty-state-icon { opacity: 0.12; margin-bottom: 8px; }
  .empty-state-title { font-size: 13px; font-weight: 500; color: var(--text-tertiary); }
  .empty-state-sub   { font-size: 12px; color: var(--text-muted); }

  /* ── CONFIRM DIALOG ── */
  .confirm-overlay { position: fixed; inset: 0; background: var(--overlay-bg2); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 200; animation: fadeIn 0.12s ease; }
  .confirm-box { background: var(--bg-confirm); border: 1px solid var(--border-confirm); border-radius: 12px; padding: 22px 24px; width: 320px; box-shadow: 0 20px 60px rgba(0,0,0,0.15); animation: modalIn 0.15s cubic-bezier(0.16, 1, 0.3, 1); }
  .app.day .confirm-box { box-shadow: 0 8px 40px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.04); }
  .confirm-title { font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; letter-spacing: -0.2px; }
  .confirm-sub   { font-size: 12.5px; color: var(--text-secondary); margin-bottom: 20px; line-height: 1.5; }
  .confirm-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .btn-danger { padding: 6px 14px; border-radius: 7px; background: #5a1a1a; border: 1px solid #7a2020; color: #f0a0a0; font-size: 12.5px; font-family: 'Inter', sans-serif; font-weight: 600; cursor: pointer; transition: all 0.1s; }
  .btn-danger:hover { background: #7a2020; }
  .app.day .btn-danger { background: #fef2f2; border-color: #fecaca; color: #dc2626; }
  .app.day .btn-danger:hover { background: #fee2e2; }

  /* ── DETAIL PANEL ── */
  .detail-backdrop { position: fixed; inset: 0; z-index: 19; background: var(--overlay-bg); backdrop-filter: blur(4px); animation: fadeIn 0.12s ease; }
  .app.day .detail-backdrop { backdrop-filter: blur(4px); }

  .detail-panel {
    position: absolute; top: 0; right: 0; bottom: 0; width: 55%;
    display: flex; flex-direction: column; overflow: hidden;
    background: var(--bg-card); border-radius: 10px;
    border: 1px solid var(--border-input);
    box-shadow: -8px 0 40px var(--shadow-panel), 0 0 0 1px var(--shadow-panel);
    z-index: 20;
  }
  .app.day .detail-panel {
    border: 1px solid #e8eaef;
    box-shadow: 0 4px 32px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.04);
  }
  .detail-panel.enter { animation: panelIn  0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
  .detail-panel.exit  { animation: panelOut 0.18s cubic-bezier(0.4, 0, 1, 1) forwards; }
  .detail-panel.enter .detail-topbar, .detail-panel.enter .status-selector, .detail-panel.enter .detail-meta-grid-wrap, .detail-panel.enter .detail-body { animation: panelContentIn 0.28s cubic-bezier(0.16, 1, 0.3, 1) both; }
  .detail-panel.enter .status-selector { animation-delay: 0.04s; }
  .detail-panel.enter .detail-meta-grid-wrap { animation-delay: 0.07s; }
  .detail-panel.enter .detail-body { animation-delay: 0.1s; }

  .detail-topbar { display: flex; align-items: flex-start; gap: 10px; padding: 18px 18px 16px; border-bottom: 1px solid var(--border-main); flex-shrink: 0; border-radius: 10px 10px 0 0; background: var(--bg-card); }
  .detail-topbar-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; padding-top: 2px; }
  .detail-lead-name { font-size: 20px; font-weight: 600; color: var(--text-primary); letter-spacing: -0.6px; line-height: 1.15; }
  .detail-lead-sub  { font-size: 12.5px; font-weight: 400; color: var(--text-secondary); letter-spacing: -0.1px; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .detail-close { display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 6px; background: transparent; border: none; cursor: pointer; color: var(--text-secondary); transition: background 0.1s, color 0.1s; }
  .detail-close:hover { background: var(--bg-hover); color: var(--text-cell); }

  .detail-edit-btn { display: flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 6px; background: transparent; border: 1px solid var(--border-input); cursor: pointer; color: var(--text-secondary); font-size: 11.5px; font-family: 'Inter', sans-serif; font-weight: 500; transition: all 0.1s; }
  .detail-edit-btn:hover  { background: var(--bg-hover); color: var(--text-cell); border-color: var(--border-status); }
  .detail-edit-btn.active { background: var(--bg-row-selected); border-color: var(--border-input-focus); color: var(--border-input-focus); }
  .detail-edit-btn.saved { border-color: #16a34a; color: #16a34a; }
  .app:not(.day) .detail-edit-btn.saved { border-color: #2a8f4e; color: #2a8f4e; }

  /* Meta grid */
  .detail-meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--border-main); border-bottom: 1px solid var(--border-main); flex-shrink: 0; }
  .detail-meta-cell { background: var(--bg-card); padding: 12px 16px; display: flex; flex-direction: column; gap: 4px; }
  .detail-meta-label { font-size: 9.5px; color: var(--text-secondary); font-weight: 500; letter-spacing: 0.3px; text-transform: uppercase; }
  .detail-meta-value { font-size: 12.5px; color: var(--text-primary); font-weight: 400; }
  .detail-meta-value.urgent  { color: #7aa4e0; }
  .app.day .detail-meta-value.urgent  { color: #1d4ed8; }
  .detail-meta-value.warning { color: #5a84c0; }
  .app.day .detail-meta-value.warning { color: #2563eb; }
  .detail-meta-value.caution { color: #4a6ea8; }
  .app.day .detail-meta-value.caution { color: #3b82f6; }
  .detail-meta-value.blue    { color: #5a84c0; }
  .app.day .detail-meta-value.blue    { color: #2563eb; }
  .detail-meta-value.dim     { color: var(--text-muted); }

  .meta-input { background: var(--bg-input-meta); border: 1px solid var(--border-status); border-radius: 5px; padding: 4px 8px; font-size: 12.5px; font-family: 'Inter', sans-serif; color: var(--text-primary); outline: none; width: 100%; transition: border-color 0.15s, box-shadow 0.15s; box-sizing: border-box; appearance: none; }
  .meta-input:focus { border-color: var(--border-input-focus); }
  .app.day .meta-input:focus { box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
  .meta-input::placeholder { color: var(--text-muted); }

  /* Detail body / notes */
  .detail-body { flex: 1; overflow-y: auto; position: relative; background: var(--bg-card); }
  .detail-body-inner { padding-bottom: 20px; }
  .detail-scroll-fade { position: sticky; bottom: 0; left: 0; right: 0; height: 32px; background: linear-gradient(to bottom, transparent, var(--bg-card)); pointer-events: none; margin-top: -32px; }
  .detail-body::-webkit-scrollbar { width: 4px; }
  .detail-body::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 3px; }

  .detail-notes { padding: 16px 18px 20px; display: flex; flex-direction: column; gap: 10px; }
  .notes-label { font-size: 10px; font-weight: 600; color: var(--text-secondary); letter-spacing: 0.3px; text-transform: uppercase; }
  .notes-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; padding: 10px 16px; border: 1px dashed var(--border-input); border-radius: 8px; cursor: pointer; transition: border-color 0.15s, background 0.15s; min-height: 56px; }
  .notes-empty:hover { border-color: var(--border-input-focus); background: var(--bg-input); }
  .notes-empty-icon { font-size: 16px; opacity: 0.2; }
  .notes-empty-text { font-size: 12px; color: var(--text-muted); }
  .notes-empty-hint { font-size: 10.5px; color: var(--text-dimmer); }
  .notes-textarea { width: 100%; background: var(--bg-input); border: 1px solid var(--border-input); border-radius: 7px; padding: 9px 11px; font-size: 12.5px; font-family: 'Inter', sans-serif; color: var(--text-cell); resize: none; outline: none; transition: border-color 0.15s, box-shadow 0.15s; line-height: 1.5; min-height: 56px; }
  .notes-textarea:focus { border-color: var(--border-input-focus); color: var(--text-primary); }
  .app.day .notes-textarea:focus { box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
  .notes-textarea::placeholder { color: var(--text-muted); }
  .notes-footer { display: flex; align-items: center; justify-content: space-between; }
  .notes-saved-at { font-size: 10.5px; color: var(--text-muted); }
  .notes-save-btn { padding: 4px 13px; border-radius: 7px; background: var(--btn-primary-bg); color: var(--btn-primary-text); border: none; font-size: 11.5px; font-family: 'Inter', sans-serif; font-weight: 500; cursor: pointer; transition: opacity 0.15s; }
  .notes-save-btn:hover    { opacity: 0.85; }
  .notes-save-btn:disabled { opacity: 0.35; cursor: not-allowed; }

  .notes-history { display: flex; flex-direction: column; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-main); }
  .note-entry { display: flex; gap: 12px; padding-bottom: 18px; }
  .note-entry:last-child { padding-bottom: 0; }
  .note-timeline-col { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; width: 14px; padding-top: 3px; }
  .note-timeline-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--border-input); border: 1.5px solid var(--border-status); flex-shrink: 0; z-index: 1; }
  .note-entry:first-child .note-timeline-dot { background: var(--border-input-focus); border-color: var(--border-input-focus); box-shadow: 0 0 6px rgba(74,143,212,0.5); }
  .note-timeline-line { width: 1px; flex: 1; background: var(--border-main); margin-top: 4px; }
  .note-entry:last-child .note-timeline-line { display: none; }
  .note-entry-body { flex: 1; min-width: 0; }
  .note-entry-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; }
  .note-entry-time { font-size: 10px; color: var(--text-tertiary); font-weight: 600; letter-spacing: 0.4px; text-transform: uppercase; }
  .note-entry-delete { display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 4px; border: none; background: transparent; cursor: pointer; color: var(--text-muted); transition: background 0.1s, color 0.1s; }
  .note-entry-delete:hover { background: #221414; color: #a83838; }
  .app.day .note-entry-delete:hover { background: #fef2f2; color: #dc2626; }
  .note-entry-text { font-size: 12.5px; color: var(--text-cell); line-height: 1.6; white-space: pre-wrap; }

  /* ── ADD CUSTOMER MODAL ── */
  .modal-overlay { position: fixed; inset: 0; background: var(--overlay-bg); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 100; animation: fadeIn 0.12s ease; }
  .app.day .modal-overlay { backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
  .modal {
    background: var(--bg-panel); border: 1px solid var(--border-card); border-radius: 14px; width: 480px; overflow: hidden;
    box-sizing: border-box; box-shadow: 0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05), 0 1px 0 rgba(255,255,255,0.08) inset;
    animation: modalIn 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .app.day .modal { box-shadow: 0 8px 40px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05); border-color: #e8eaef; }
  .modal-topbar { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px 14px; }
  .modal-name-input { background: transparent; border: none; outline: none; font-size: 16px; font-weight: 500; color: var(--text-primary); font-family: 'Inter', sans-serif; letter-spacing: -0.2px; flex: 1; min-width: 0; }
  .modal-name-input::placeholder { color: var(--text-primary); font-weight: 500; opacity: 0.5; }
  .modal-subtitle { font-size: 11px; color: var(--text-secondary); letter-spacing: 0.2px; text-transform: uppercase; font-weight: 500; }
  .modal-close { display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 6px; background: transparent; border: none; cursor: pointer; color: var(--text-secondary); transition: background 0.1s, color 0.1s; }
  .modal-close:hover { background: var(--bg-hover); color: var(--text-cell); }
  .modal-body { padding: 0 18px 18px; display: flex; flex-direction: column; gap: 14px; box-sizing: border-box; width: 100%; }
  .modal-row { display: grid; gap: 8px; box-sizing: border-box; width: 100%; }
  .modal-row.cols-2 { grid-template-columns: 1fr 1fr; }
  .modal-row.cols-3 { grid-template-columns: 1fr 1fr 1fr; }
  .modal-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .modal-field label { font-size: 10px; font-weight: 500; color: var(--text-secondary); letter-spacing: 0.3px; text-transform: uppercase; }
  .modal-field input { background: var(--bg-input); border: 1px solid var(--border-input); border-radius: 6px; padding: 6px 9px; font-size: 12px; font-family: 'Inter', sans-serif; color: var(--text-primary); outline: none; transition: border-color 0.15s, box-shadow 0.15s; width: 100%; box-sizing: border-box; min-width: 0; }
  .modal-field input:focus { border-color: var(--border-input-focus); }
  .app.day .modal-field input:focus { box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
  .modal-field input::placeholder { color: var(--text-secondary); opacity: 0.5; }
  .modal-field select { background: var(--bg-input); border: 1px solid var(--border-input); border-radius: 6px; padding: 6px 9px; font-size: 12px; font-family: 'Inter', sans-serif; color: var(--text-primary); outline: none; transition: border-color 0.15s, box-shadow 0.15s; width: 100%; box-sizing: border-box; min-width: 0; cursor: pointer; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236b7280' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 9px center; padding-right: 26px; }
  .modal-field select:focus { border-color: var(--border-input-focus); }
  .app.day .modal-field select:focus { box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
  .modal-field select option { background: var(--bg-panel); color: var(--text-primary); }
  .modal-divider { height: 1px; background: var(--border-main); }
  .modal-footer { padding: 12px 18px; border-top: 1px solid var(--border-main); display: flex; justify-content: flex-end; gap: 8px; }
  .import-pick-card { flex: 1; display: flex; flex-direction: column; align-items: flex-start; gap: 10px; background: var(--bg-input); border: 1px solid var(--border-card); border-radius: 10px; padding: 18px 16px; cursor: pointer; transition: border-color 0.15s, background 0.15s; text-align: left; }
  .import-pick-card:hover { border-color: var(--border-input-focus); background: var(--bg-hover); }
  .import-pick-icon { width: 34px; height: 34px; border-radius: 8px; background: var(--bg-hover-sm); border: 1px solid var(--border-input); display: flex; align-items: center; justify-content: center; }

  /* ── TOASTS — always dark ── */
  .toast-container { position: fixed; bottom: 20px; right: 20px; display: flex; flex-direction: column; gap: 6px; z-index: 9999; pointer-events: none; align-items: flex-end; }
  .toast {
    display: flex; align-items: center; gap: 9px;
    background: rgba(13,16,24,0.94); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 10px 13px 10px 10px;
    min-width: 200px; max-width: 300px; box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.04) inset;
    pointer-events: all; position: relative; overflow: hidden; animation: toastIn 0.28s cubic-bezier(0.16,1,0.3,1) both;
  }
  .toast-container.day .toast {
    background: rgba(255,255,255,0.96); border: 1px solid rgba(0,0,0,0.08);
    box-shadow: 0 4px 24px rgba(0,0,0,0.1), 0 1px 0 rgba(255,255,255,0.8) inset;
  }
  .toast.leaving { animation: toastOut 0.2s cubic-bezier(0.4,0,1,1) forwards; }
  .toast-dot { flex-shrink: 0; width: 6px; height: 6px; border-radius: 50%; margin-left: 2px; }
  .toast-dot.success { background: #34d399; box-shadow: 0 0 6px rgba(52,211,153,0.6); }
  .toast-dot.error   { background: #f87171; box-shadow: 0 0 6px rgba(248,113,113,0.6); }
  .toast-dot.info    { background: #60a5fa; box-shadow: 0 0 6px rgba(96,165,250,0.6); }
  .toast-dot.warning { background: #fbbf24; box-shadow: 0 0 6px rgba(251,191,36,0.6); }
  .toast-body { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .toast-name { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.95); letter-spacing: -0.1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .toast-detail { font-size: 11px; font-weight: 400; color: rgba(255,255,255,0.55); letter-spacing: -0.1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .toast-container.day .toast-name { color: #111827; }
  .toast-container.day .toast-detail { color: #6b7280; }
  .toast-progress { position: absolute; bottom: 0; left: 0; height: 1.5px; border-radius: 0 1px 0 10px; animation: toastProgress 5s linear forwards; }
  .toast-progress.success { background: linear-gradient(90deg, #34d399, transparent); }
  .toast-progress.error   { background: linear-gradient(90deg, #f87171, transparent); }
  .toast-progress.info    { background: linear-gradient(90deg, #60a5fa, transparent); }
  .toast-progress.warning { background: linear-gradient(90deg, #fbbf24, transparent); }
  @keyframes toastIn  { from { opacity:0; transform: translateY(6px) scale(0.97); } to { opacity:1; transform: translateY(0) scale(1); } }
  @keyframes toastOut { from { opacity:1; transform: translateY(0) scale(1); max-height:60px; } to { opacity:0; transform: translateY(4px) scale(0.97); max-height:0; margin-bottom:-6px; } }
  @keyframes toastProgress { from { width: 100%; } to { width: 0%; } }

  /* ── TIMELINE VIEW — CSS Grid Gantt ── */
  .timeline-panel {
    flex: 1; display: flex; flex-direction: column; overflow: hidden;
    background: var(--bg-panel); border-radius: 10px;
    border: 1px solid var(--border-card);
    box-shadow: 0 0 0 1px var(--shadow-panel), 0 8px 32px var(--shadow-panel);
    animation: fadeIn 0.18s ease;
  }
  .app.day .timeline-panel { border: 1px solid #e8eaef; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }

  .timeline-topbar {
    display: flex; align-items: center; gap: 10px; padding: 0 18px;
    height: 46px; border-bottom: 1px solid var(--border-main);
    flex-shrink: 0; background: var(--bg-panel); border-radius: 10px 10px 0 0;
  }
  .timeline-title { font-size: 16px; font-weight: 600; color: var(--text-primary); letter-spacing: -0.3px; }

  /* Clipping viewport — hides off-screen columns, scrolls vertically */
  .tl-viewport {
    flex: 1; overflow: hidden;
    display: flex; flex-direction: column;
    position: relative; min-height: 0;
  }

  /* Full 12-col strip — slides horizontally via transform, never remounts */
  .tl-strip {
    display: grid;
    grid-template-rows: auto 1fr;
    flex: 1; min-height: 0;
    transition: transform 0.32s cubic-bezier(0.4, 0, 0.2, 1);
    will-change: transform;
  }

  /* Header row — one cell per month */
  .tl-header-row {
    display: contents;
  }
  .tl-header-cell {
    position: sticky; top: 0; z-index: 10;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border-main);
    border-right: 1px solid var(--border-main);
    padding: 8px 12px 7px;
    display: flex; align-items: center; gap: 6px;
  }
  .tl-header-cell:last-child { border-right: none; }
  .tl-month-label {
    font-size: 10.5px; font-weight: 600; color: var(--text-secondary);
    letter-spacing: 0.2px; text-transform: uppercase;
    white-space: nowrap;
  }
  .tl-month-label.is-current { color: var(--border-input-focus); }
  .app.day .tl-month-label.is-current { color: #4f46e5; }
  .tl-now-badge {
    font-size: 8px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;
    color: var(--border-input-focus); background: rgba(74,143,212,0.14);
    border-radius: 3px; padding: 1px 5px; white-space: nowrap;
  }
  .app.day .tl-now-badge { background: rgba(79,70,229,0.1); color: #4f46e5; }

  /* Pagination arrows */
  .tl-nav-btn {
    display: flex; align-items: center; justify-content: center;
    width: 26px; height: 26px; border-radius: 6px; border: 1px solid var(--border-input);
    background: var(--bg-panel); color: var(--text-secondary);
    cursor: pointer; transition: background 0.1s, color 0.1s, border-color 0.1s;
    flex-shrink: 0;
  }
  .tl-nav-btn:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); border-color: var(--border-status); }
  .tl-nav-btn:disabled { opacity: 0.25; cursor: default; }
  .tl-kbd-hint { display: flex; align-items: center; gap: 3px; opacity: 0.5; }
  .tl-page-info { font-size: 11px; color: var(--text-secondary); white-space: nowrap; font-weight: 500; }

  /* Content row — one cell per month, fills remaining height */
  .tl-body-row {
    display: contents;
  }
  .tl-col {
    border-right: 1px solid var(--border-main);
    padding: 10px 8px;
    display: flex; flex-direction: column; gap: 7px;
    align-items: stretch;
    min-height: 100%;
    position: relative;
  }
  .tl-col:last-child { border-right: none; }
  .tl-col.is-current { background: rgba(74,143,212,0.02); }
  .app.day .tl-col.is-current { background: rgba(79,70,229,0.015); }

  /* Today line — absolutely positioned inside month 0 col */
  .tl-today-line {
    position: absolute; top: 0; bottom: 0; width: 1.5px;
    background: var(--border-input-focus); opacity: 0.45;
    pointer-events: none; z-index: 2;
  }
  .app.day .tl-today-line { opacity: 0.35; background: #4f46e5; }

  /* Cards */
  .tl-card {
    background: var(--bg-card); border: 1px solid var(--border-card);
    border-radius: 8px; padding: 10px 11px; cursor: pointer;
    transition: border-color 0.12s, background 0.12s, box-shadow 0.12s;
    display: flex; flex-direction: column; gap: 5px;
    width: 100%; box-sizing: border-box;
  }
  .tl-card:hover {
    border-color: var(--border-input-focus);
    background: var(--bg-hover);
    box-shadow: 0 4px 14px rgba(0,0,0,0.10);
  }
  .tl-card.urgent { border-left: 2px solid #7aa4e0; }
  .app.day .tl-card.urgent { border-left: 2px solid #4f46e5; }

  .tl-card-name    { font-size: 12.5px; font-weight: 500; color: var(--text-name); letter-spacing: -0.1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tl-card-vehicle { font-size: 11px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tl-card-footer  { display: flex; align-items: center; justify-content: space-between; margin-top: 2px; gap: 4px; }
  .tl-card-time    { font-size: 10.5px; font-weight: 600; white-space: nowrap; }
  .tl-card-status  { font-size: 10.5px; font-weight: 500; padding: 2px 7px; border-radius: 4px; border: 1px solid transparent; white-space: nowrap; }
  .tl-card-badges  { display: flex; align-items: center; gap: 4px; margin-top: 2px; flex-wrap: wrap; }
  .tl-badge-incentive { font-size: 10.5px; font-weight: 500; padding: 2px 7px; border-radius: 4px; background: rgba(251,191,36,0.12); color: #d97706; border: 1px solid rgba(251,191,36,0.25); }
  .app:not(.day) .tl-badge-incentive { background: rgba(251,191,36,0.1); color: #f59e0b; border-color: rgba(251,191,36,0.2); }
  .tl-badge-miles  { font-size: 10.5px; font-weight: 500; padding: 2px 7px; border-radius: 4px; background: rgba(239,68,68,0.1); color: #dc2626; border: 1px solid rgba(239,68,68,0.2); }
  .app:not(.day) .tl-badge-miles { background: rgba(248,113,113,0.1); color: #f87171; border-color: rgba(248,113,113,0.2); }


  .tl-panel-overlay {
    position: absolute; top: 0; right: 0; bottom: 0; width: 55%; z-index: 20;
    animation: panelIn 0.22s cubic-bezier(0.16,1,0.3,1) forwards;
  }
  .tl-backdrop {
    position: absolute; inset: 0; z-index: 19;
    background: var(--overlay-bg); backdrop-filter: blur(4px);
    animation: fadeIn 0.12s ease;
  }

  .timeline-empty-state {
    flex: 1; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 8px; opacity: 0.5;
  }
  .timeline-empty-state-title { font-size: 13px; font-weight: 500; color: var(--text-tertiary); }
  .timeline-empty-state-sub   { font-size: 12px; color: var(--text-muted); }



`;

// ── Animated Number ───────────────────────────────────────────────────────────
function AnimatedNumber({ value, style, className }) {
  const [display, setDisplay] = useState(value);
  const [animating, setAnimating] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current === value) return;
    const start = prev.current;
    const end = value;
    const diff = end - start;
    const steps = Math.min(Math.abs(diff), 12);
    let step = 0;
    setAnimating(true);
    const timer = setInterval(() => {
      step++;
      const progress = step / steps;
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + diff * eased));
      if (step >= steps) { clearInterval(timer); setDisplay(end); setAnimating(false); prev.current = end; }
    }, 30);
    return () => clearInterval(timer);
  }, [value]);
  return <span className={className} style={{ ...style, transition: animating ? "none" : undefined }}>{display}</span>;
}

function incentiveColor(amount, dayMode) {
  if (!amount || amount === 0) return undefined;
  if (dayMode) {
    if (amount >= 2000) return "#1d4ed8";
    if (amount >= 1500) return "#2563eb";
    if (amount >= 1000) return "#3b82f6";
    return "#6b7280";
  }
  if (amount >= 2000) return "#93c5fd";
  if (amount >= 1500) return "#7aa4e0";
  if (amount >= 1000) return "#5a84c0";
  return "#4a6ea8";
}
function formatDollar(val) {
  const n = parseFloat(String(val).replace(/[$,]/g, ""));
  if (isNaN(n) || n === 0) return "";
  return n.toLocaleString();
}

// ── COMPONENT ─────────────────────────────────────────────────────────────────


// ── Toast system ──────────────────────────────────────────────────────────────
function exportCSV(rows) {
  const headers = ["Name","Year","Model","Trim","Bank","Term","Lease End","Mo. Left","Status",
    "Monthly Payment","Down Payment","Trade Equity","Incentive","Incentive Exp",
    "Miles/Year","Miles/Term","Odometer","Accident"];
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g,'""')}"` : s;
  };
  const lines = [headers.join(",")];
  rows.forEach(c => {
    const ml = calcMonthsLeft(c.leaseEnd);
    const dl = calcDaysLeft(c.leaseEnd);
    const raw = rawDaysLeft(c.leaseEnd);
    lines.push([
      c.name, c.year, c.model, c.trim, c.bank,
      c.term ? `${c.term} mo` : "",
      c.leaseEnd, formatTimeLeft(ml, dl, raw),
      statusMeta(c.status)?.label || c.status,
      c.monthlyPayment > 0 ? `$${c.monthlyPayment}` : "",
      c.downPayment   > 0 ? `$${c.downPayment}`   : "",
      c.tradeEquity   > 0 ? `$${c.tradeEquity}`   : "",
      c.privateIncentive > 0 ? `$${c.privateIncentive}` : "",
      c.incentiveExp !== "—" ? c.incentiveExp : "",
      c.milesYearly   > 0 ? c.milesYearly   : "",
      c.milesTerm     > 0 ? c.milesTerm     : "",
      c.currentMiles  > 0 ? c.currentMiles  : "",
      c.hasAccident ? "Yes" : "",
    ].map(esc).join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `leases-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function useToast() {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = "success", detail = null) => {
    const id = uid();
    setToasts(prev => [...prev, { id, message, detail, type, leaving: false }]);
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, leaving: true } : t));
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 200);
    }, 5000);
  }, []);

  return { toasts, addToast };
}

const TOAST_ICONS = {
  success: "✓",
  error:   "✕",
  info:    "i",
  warning: "!",
};

function ToastContainer({ toasts, isDayMode }) {
  if (!toasts.length) return null;
  return (
    <div className={"toast-container" + (isDayMode ? " day" : "")}>
      {toasts.map(t => (
        <div key={t.id} className={`toast${t.leaving ? " leaving" : ""}`}>
          <div className={`toast-dot ${t.type}`} />
          <div className="toast-body">
            <span className="toast-name">{t.message}</span>
            {t.detail && <span className="toast-detail">{t.detail}</span>}
          </div>
          <div className={`toast-progress ${t.type}`} />
        </div>
      ))}
    </div>
  );
}




// ── Print Customer Card ───────────────────────────────────────────────────────
function printCustomer(c, notes) {
  const fmt$ = (n) => n > 0 ? `$${Number(n).toLocaleString()}` : '—';
  const fmtMi = (n) => n > 0 ? Number(n).toLocaleString() + ' mi' : '—';
  const ml = calcMonthsLeft(c.leaseEnd);
  const dl = calcDaysLeft(c.leaseEnd);
  const timeLeft = ml === 0 ? (dl <= 0 ? 'Expired' : `${dl} days left`) : `${ml} months left`;
  const mp = calcMileagePace(c);
  const milesPace = mp
    ? mp.status === 'ok'
      ? `On pace (proj. ${mp.projectedTotal.toLocaleString()} mi)`
      : mp.status === 'over'
      ? `Over by ~${Math.abs(mp.overage).toLocaleString()} mi`
      : `On pace to exceed by ~${mp.overage.toLocaleString()} mi`
    : '—';

  const FULL_MONTHS = { Jan:'January', Feb:'February', Mar:'March', Apr:'April', May:'May', Jun:'June', Jul:'July', Aug:'August', Sep:'September', Oct:'October', Nov:'November', Dec:'December' };
  const fmtMonth = (str) => str && str !== '—' ? str.replace(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i, m => FULL_MONTHS[m] || m) : '—';

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const vehicle = [c.year, c.model, (c.trim && c.trim !== '—') ? c.trim : null].filter(Boolean).join(' ') || '—';

  const rows = [
    ['Year',              c.year || '—'],
    ['Model',             c.model || '—'],
    ['Trim',              (c.trim && c.trim !== '—') ? c.trim : '—'],
    ['Bank',              c.bank || '—'],
    ['Term',              c.term ? `${c.term} months` : '—'],
    ['Lease End',         c.leaseEnd || '—'],
    ['Time Remaining',    timeLeft],
    ['Monthly Payment',   fmt$(c.monthlyPayment)],
    ['Down Payment',      fmt$(c.downPayment)],
    ['Trade Equity',      c.tradeEquity > 0 ? fmt$(c.tradeEquity) : '$0'],
    ['Incentive Value',   fmt$(c.privateIncentive)],
    ['Incentive Expires', fmtMonth(c.incentiveExp)],
    ['Miles / Year',      fmtMi(c.milesYearly)],
    ['Miles / Term',      fmtMi(c.milesTerm)],
    ['Odometer',          c.currentMiles > 0 ? Number(c.currentMiles).toLocaleString() + ' mi' : '—'],
    ['Mileage Pace',      milesPace],
    ...(c.hasAccident ? [['Accident Reported', 'Yes']] : []),
  ];

  const rowsHtml = rows.map(([label, val]) => `
    <tr>
      <td class="label">${label}</td>
      <td class="val">${val}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${c.name} — Lease Summary</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', sans-serif; background: #fff; color: #111827; font-size: 13px; padding: 44px; max-width: 700px; margin: 0 auto; }

    /* ── Header ── */
    .header {
      display: flex; justify-content: space-between; align-items: stretch;
      margin-bottom: 32px; gap: 24px;
    }
    .header-left {
      flex: 1;
      display: flex; flex-direction: column; justify-content: center;
    }
    .header-right {
      display: flex; flex-direction: column; align-items: flex-end; justify-content: center;
      text-align: right;
    }
    .name {
      font-size: 26px; font-weight: 700; letter-spacing: -0.6px;
      color: #111827; line-height: 1.15;
    }
    .vehicle {
      font-size: 13.5px; color: #6b7280; margin-top: 5px;
      font-weight: 400; letter-spacing: -0.1px;
    }
    .print-date {
      font-size: 13px; font-weight: 600; color: #111827; letter-spacing: -0.2px;
    }
    .print-time {
      font-size: 11.5px; color: #9ca3af; margin-top: 3px; font-weight: 400;
    }
    .header-rule {
      height: 1px; background: #e5e7eb; margin-bottom: 28px;
    }

    /* ── Table ── */
    .section-title { font-size: 9px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: #9ca3af; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; }
    tr { border-bottom: 1px solid #f3f4f6; }
    tr:last-child { border-bottom: none; }
    td { padding: 8px 0; vertical-align: top; }
    td.label { width: 46%; font-size: 12px; color: #6b7280; font-weight: 500; }
    td.val { font-size: 12px; color: #111827; font-weight: 500; }

    @media print {
      body { padding: 28px; }
      @page { margin: 0.5in; size: letter; }
    }
  </style>
</head>
<body>

  <div class="header">
    <div class="header-left">
      <div class="name">${c.name}</div>
      <div class="vehicle">${vehicle}</div>
    </div>
    <div class="header-right">
      <div class="print-date">${dateStr}</div>
      <div class="print-time">${timeStr}</div>
    </div>
  </div>
  <div class="header-rule"></div>

  <div class="section-title">Lease Details</div>
  <table>${rowsHtml}</table>

  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=720,height=900');
  if (!win) { alert('Please allow popups to print customer cards.'); return; }
  win.document.write(html);
  win.document.close();
}


// ── TIMELINE VIEW — CSS Grid Gantt ──────────────────────────────────────────

const TIMELINE_MONTHS = 12;
const IDEAL_COL = 220;

function TimelineView({ customers, isDayMode, openPanel, openModal }) {
  const now = useRef(new Date()).current;
  const [tlSearch, setTlSearch] = useState('');
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // How many columns fit at ideal width
  const visibleCols = useMemo(() => {
    if (!containerWidth) return TIMELINE_MONTHS;
    return Math.min(TIMELINE_MONTHS, Math.max(1, Math.floor(containerWidth / IDEAL_COL)));
  }, [containerWidth]);

  // Each column is exactly containerWidth / visibleCols — fills edge to edge
  const colWidth = containerWidth > 0 ? Math.floor(containerWidth / visibleCols) : IDEAL_COL;

  const needsPagination = visibleCols < TIMELINE_MONTHS;
  const maxPage = Math.max(0, TIMELINE_MONTHS - visibleCols);
  const safePage = Math.min(page, maxPage);
  useEffect(() => { if (page > maxPage) setPage(maxPage); }, [maxPage]);

  // All 12 months — always rendered, never unmounted
  const months = useMemo(() =>
    Array.from({ length: TIMELINE_MONTHS }, (_, i) =>
      new Date(now.getFullYear(), now.getMonth() + i, 1)
    ), []);

  // translateX slides the full strip left/right — no remount
  const translateX = -(safePage * colWidth);

  const todayPct = useMemo(() => {
    const ms = new Date(now.getFullYear(), now.getMonth(), 1);
    const me = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return ((now - ms) / (me - ms)) * 100;
  }, []);

  const buckets = useMemo(() => {
    const map = new Map();
    months.forEach(m => map.set(`${m.getFullYear()}-${m.getMonth()}`, []));
    const q = tlSearch.toLowerCase();
    customers.forEach(c => {
      const end = smartParseDate(c.leaseEnd);
      if (!end) return;
      const key = `${end.getFullYear()}-${end.getMonth()}`;
      if (!map.has(key)) return;
      if (q) {
        const s = [c.name, c.model, c.trim, c.bank, statusMeta(c.status)?.label].filter(Boolean).join(' ').toLowerCase();
        if (!s.includes(q)) return;
      }
      map.get(key).push(c);
    });
    map.forEach(arr => arr.sort((a, b) => parseDateVal(a.leaseEnd) - parseDateVal(b.leaseEnd)));
    return map;
  }, [customers, months, tlSearch]);

  const total = useMemo(() => { let n = 0; buckets.forEach(a => n += a.length); return n; }, [buckets]);

  const rangeLabel = useMemo(() => {
    if (!needsPagination) return null;
    const first = months[safePage];
    const last  = months[safePage + visibleCols - 1];
    const sameYear = first.getFullYear() === last.getFullYear();
    return sameYear
      ? `${MONTH_SHORT[first.getMonth()]} – ${MONTH_SHORT[last.getMonth()]} ${last.getFullYear()}`
      : `${MONTH_SHORT[first.getMonth()]} ${first.getFullYear()} – ${MONTH_SHORT[last.getMonth()]} ${last.getFullYear()}`;
  }, [safePage, visibleCols, months, needsPagination]);

  // Keyboard left/right arrows to paginate timeline
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowLeft')  setPage(p => Math.max(0, p - 2));
      if (e.key === 'ArrowRight') setPage(p => Math.min(maxPage, p + 2));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [maxPage]);

  const totalStripWidth = colWidth * TIMELINE_MONTHS;

  return (
    <div className="timeline-panel">
      <div className="timeline-topbar">
        <span className="timeline-title">Timeline</span>
        {needsPagination && (
          <>
            <button className="tl-nav-btn" disabled={safePage === 0} onClick={() => setPage(p => Math.max(0, p - 2))}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span className="tl-page-info">{rangeLabel}</span>
            <span className="tl-kbd-hint">
              <kbd className="kbd">←</kbd>
              <kbd className="kbd">→</kbd>
            </span>
            <button className="tl-nav-btn" disabled={safePage >= maxPage} onClick={() => setPage(p => Math.min(maxPage, p + 2))}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </>
        )}
        <div className="spacer" />
        <input className="search-box" placeholder="Search..." value={tlSearch} onChange={e => setTlSearch(e.target.value)} />
        <button className="btn-primary" onClick={openModal}><UserPlus size={13} strokeWidth={2} />New Customer</button>
      </div>

      {/* Clipping viewport — hides the off-screen columns */}
      <div className="tl-viewport" ref={containerRef}>
        {containerWidth > 0 && (
          /* Full strip — all 12 cols, slides via transform only */
          <div
            className="tl-strip"
            style={{
              width: totalStripWidth,
              gridTemplateColumns: `repeat(${TIMELINE_MONTHS}, ${colWidth}px)`,
              transform: `translateX(${translateX}px)`,
            }}
          >
            {/* Header cells */}
            {months.map((m, i) => (
              <div key={`h${i}`} className="tl-header-cell">
                <span className={`tl-month-label${i === 0 ? ' is-current' : ''}`}>
                  {MONTH_SHORT[m.getMonth()]} {m.getFullYear()}
                </span>
                {i === 0 && <span className="tl-now-badge">Now</span>}
              </div>
            ))}

            {/* Body cells — one per month, always in DOM */}
            {months.map((m, i) => {
              const key   = `${m.getFullYear()}-${m.getMonth()}`;
              const cards = buckets.get(key) || [];
              const isCurrent = i === 0;

              return (
                <div key={`b${i}`} className={`tl-col${isCurrent ? ' is-current' : ''}`}>
                  {isCurrent && <div className="tl-today-line" style={{ left: `${todayPct}%` }} />}
                  {total === 0 && i === 0 && (
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6, opacity:0.5, padding:'40px 0' }}>
                      <span className="timeline-empty-state-title">{tlSearch ? 'No matches' : 'No upcoming lease ends'}</span>
                      <span className="timeline-empty-state-sub">{tlSearch ? 'Try a different search' : 'Add customers to see them here'}</span>
                    </div>
                  )}
                  {cards.map(c => {
                    const ml  = calcMonthsLeft(c.leaseEnd);
                    const dl  = calcDaysLeft(c.leaseEnd);
                    const urgent = ml === 0;
                    const timeColor = ml === 0
                      ? (isDayMode ? '#4f46e5' : '#7aa4e0')
                      : ml <= 3 ? (isDayMode ? '#2563eb' : '#5a84c0')
                      : 'var(--text-secondary)';
                    const timeStr = ml === 0 ? (dl <= 0 ? 'Today' : `${dl}d left`) : `${ml} mo`;
                    const sm = statusMeta(c.status);
                    const vehicle = [c.year, c.model, c.trim && c.trim !== '—' ? c.trim : null].filter(Boolean).join(' ');
                    const hasIncentive = c.privateIncentive > 0;
                    const mp = calcMileagePace(c);
                    const hasMiles = mp && (mp.status === 'over' || mp.status === 'warning');
                    return (
                      <div key={c.id} className={`tl-card${urgent ? ' urgent' : ''}`} onClick={() => openPanel(c.id)}>
                        <span className="tl-card-name">{c.name}</span>
                        {vehicle && <span className="tl-card-vehicle">{vehicle}</span>}
                        <div className="tl-card-footer">
                          <span className="tl-card-time" style={{ color: timeColor }}>{timeStr}</span>
                          <span className="tl-card-status" style={{ background: sm.color+'22', color: sm.color, borderColor: sm.color+'44' }}>{sm.label}</span>
                        </div>
                        {(hasIncentive || hasMiles) && (
                          <div className="tl-card-badges">
                            {hasIncentive && <span className="tl-badge-incentive">${Number(c.privateIncentive).toLocaleString()} · {c.incentiveExp && c.incentiveExp !== '—' ? c.incentiveExp : 'incentive'}</span>}
                            {hasMiles && <span className="tl-badge-miles">{mp.status === 'over' ? `+${Math.abs(mp.overage).toLocaleString()} mi over` : 'miles at risk'}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


export default function LeaseTracker() {
  const { user, signOut } = useAuth();
  const { toasts, addToast } = useToast();
  const [showSettings, setShowSettings] = useState(false);
  const [activeView, setActiveView] = useState("maturities"); // "maturities" | "timeline"
  const [state,   dispatch] = useReducer(reducer, null, loadState);
  const { customers, notes } = state;
  const [dbLoading, setDbLoading] = useState(true);
  const hasLoaded = useRef(false);

  // Panel state — "closed" | "open" | "closing"
  const [panelState,    setPanelState]    = useState("closed");
  const [selected,      setSelected]      = useState(null);
  const [snapCustomer,  setSnapCustomer]  = useState(null);

  const [editMode,  setEditMode]  = useState(false);
  const [editForm,  setEditForm]  = useState({});
  const [editSaved,   setEditSaved]   = useState(false);
  const [editSaving,  setEditSaving]  = useState(false);

  // Notes — simple: show empty state or textarea
  const [noteDraft, setNoteDraft] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const notesRef = useRef(null);

  const [search,    setSearch]    = useState("");
  const [sortKey,   setSortKey]   = useState(() => { try { return JSON.parse(localStorage.getItem("lt-prefs") || "{}").sortKey || "leaseEnd"; } catch { return "leaseEnd"; } });
  const [sortDir,   setSortDir]   = useState(() => { try { return JSON.parse(localStorage.getItem("lt-prefs") || "{}").sortDir || "asc"; } catch { return "asc"; } });

  const [showModal, setShowModal] = useState(false);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [modalTab,    setModalTab]    = useState("manual");
  const [importText,  setImportText]  = useState("");
  const [importError, setImportError] = useState("");

  const [confirmDel, setConfirmDel] = useState(null);
  const [confirmDiscard, setConfirmDiscard] = useState(null);
  const [isDayMode,  setIsDayMode]  = useState(() => {
    try { const saved = localStorage.getItem('lt_theme'); return saved !== null ? saved === 'day' : true; } catch { return true; }
  });
  const isWindows = typeof navigator !== 'undefined' && /Win/i.test(navigator.platform || navigator.userAgent);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [density, setDensity] = useState(() => { try { return JSON.parse(localStorage.getItem("lt-prefs") || "{}").density || "comfortable"; } catch { return "comfortable"; } });
  const [flashingStatus, setFlashingStatus] = useState(null);
  const [themeAnimating, setThemeAnimating] = useState(false);
  const [densityOpen, setDensityOpen] = useState(false);
  const densityRef = useRef(null);
  const [statFilter, setStatFilter]  = useState(() => { try { return JSON.parse(localStorage.getItem("lt-prefs") || "{}").statFilter || null; } catch { return null; } });

  const toggleTheme = useCallback(() => {
    setThemeAnimating(true);
    setIsDayMode(v => {
      const next = !v;
      try { localStorage.setItem('lt_theme', next ? 'day' : 'night'); } catch {}
      return next;
    });
    setTimeout(() => setThemeAnimating(false), 400);
  }, []);

  useEffect(() => {
    if (!densityOpen) return;
    const handler = (e) => { if (densityRef.current && !densityRef.current.contains(e.target)) setDensityOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [densityOpen]);

  const closeTimer   = useRef(null);
  const persistTimer = useRef(null);

  // ── Load from Supabase on mount ──
  useEffect(() => {
    if (!user) return;
    if (hasLoaded.current) return; // already loaded — don't re-fetch on token refresh
    hasLoaded.current = true;
    async function loadFromSupabase() {
      setDbLoading(true);
      // Load customers
      const { data: custData } = await supabase
        .from("customers")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      // Load notes
      const { data: notesData } = await supabase
        .from("notes")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (custData) {
        // Convert snake_case DB fields to camelCase app fields
        const mapped = custData.map(c => ({
          id:               c.id,
          name:             c.name,
          year:             c.year,
          model:            c.model || "—",
          trim:             c.trim  || "—",
          bank:             c.bank  || "—",
          term:             c.term,
          milesYearly:      c.miles_yearly,
          milesTerm:        c.miles_term,
          currentMiles:     c.current_miles,
          monthlyPayment:   c.monthly_payment,
          downPayment:      c.down_payment,
          tradeEquity:      c.trade_equity,
          leaseEnd:         c.lease_end || "—",
          privateIncentive: c.private_incentive,
          incentiveExp:     c.incentive_exp || "—",
          status:           c.status || "early",
          hasAccident:      c.has_accident || false,
          updatedAt:        c.updated_at,
        }));
        dispatch({ type: "LOAD_CUSTOMERS", customers: mapped });
      }

      if (notesData) {
        // Group notes by customer_id
        const grouped = {};
        notesData.forEach(n => {
          if (!grouped[n.customer_id]) grouped[n.customer_id] = [];
          grouped[n.customer_id].push({ id: n.id, text: n.text, savedAt: n.saved_at });
        });
        const notesMap = {};
        Object.entries(grouped).forEach(([custId, entries]) => {
          notesMap[custId] = { history: entries };
        });
        dispatch({ type: "LOAD_NOTES", notes: notesMap });
      }

      setDbLoading(false);
    }
    loadFromSupabase();
  }, [user]);

  // ── Keep snapshot fresh while panel is open ──

  useEffect(() => {
    if (panelState === "open" && selected) {
      const c = customers.find(x => x.id === selected);
      if (c) setSnapCustomer(c);
    }
  }, [customers, selected, panelState]);

  // ── Panel ──

  const openPanel = useCallback((id, enterEdit = false) => {
    const c = customers.find(x => x.id === id);
    if (!c) return;
    clearTimeout(closeTimer.current);
    setSelected(id);
    setSnapCustomer(c);
    setNoteDraft("");
    setNotesOpen(false);
    setEditSaved(false);
    if (enterEdit) {
      setEditForm({
        name:             c.name,
        year:             String(c.year),
        model:            c.model === "—" ? "" : c.model,
        trim:             (!c.trim  || c.trim  === "—") ? "" : c.trim,
        bank:             (!c.bank  || c.bank  === "—") ? "" : c.bank,
        term:             c.term  ? String(c.term)  : "",
        milesYearly:      c.milesYearly  ? Number(c.milesYearly).toLocaleString() : "",
        milesTerm:        c.milesTerm    ? Number(c.milesTerm).toLocaleString() : "",
        currentMiles:     String(c.currentMiles),
        monthlyPayment:   c.monthlyPayment ? String(c.monthlyPayment) : "",
        downPayment:      c.downPayment   ? String(c.downPayment)   : "",
        tradeEquity:      c.tradeEquity   ? String(c.tradeEquity)   : "",
        leaseEnd:         c.leaseEnd === "—" ? "" : c.leaseEnd,
        privateIncentive: c.privateIncentive > 0 ? String(c.privateIncentive) : "",
        incentiveExp:     c.incentiveExp === "—" ? "" : c.incentiveExp,
      });
      setEditMode(true);
    } else {
      setEditMode(false);
    }
    setPanelState("open");
  }, [customers]);

  // Returns true if editForm differs from the saved customer snapshot
  function hasUnsavedEdits() {
    if (!editMode || !snapCustomer) return false;
    const fields = ["name","year","model","trim","bank","term","milesYearly","milesTerm",
      "currentMiles","monthlyPayment","downPayment","tradeEquity","leaseEnd","privateIncentive","incentiveExp"];
    return fields.some(k => {
      const formVal = String(editForm[k] ?? "").trim().replace(/,/g,"");
      const custVal = String(snapCustomer[k] ?? "").trim().replace(/,/g,"");
      return formVal !== custVal;
    });
  }

  const closePanel = useCallback(() => {
    if (hasUnsavedEdits()) {
      setConfirmDiscard({ action: () => {
        clearTimeout(closeTimer.current);
        setEditMode(false);
        setPanelState("closing");
        closeTimer.current = setTimeout(() => {
          setPanelState("closed");
          setSelected(null);
          setNoteDraft("");
          setNotesOpen(false);
        }, 200);
      }});
      return;
    }
    clearTimeout(closeTimer.current);
    setEditMode(false);
    setPanelState("closing");
    closeTimer.current = setTimeout(() => {
      setPanelState("closed");
      setSelected(null);
      setNoteDraft("");
      setNotesOpen(false);
    }, 200);
  }, [editMode, editForm, snapCustomer, confirmDiscard]);

  const handleRowClick = useCallback((id) => {
    if (id === selected && panelState === "open") return;
    if (hasUnsavedEdits()) {
      setConfirmDiscard({ action: () => openPanel(id) });
      return;
    }
    openPanel(id);
  }, [selected, panelState, openPanel, editMode, editForm, snapCustomer]);

  // ── Notes ──
  // useEffect runs after DOM commit so ref is guaranteed populated when notesOpen flips true
  useEffect(() => {
    if (notesOpen && notesRef.current) {
      notesRef.current.focus();
    }
  }, [notesOpen]);

  const openNotes = useCallback(() => {
    setNotesOpen(true);
  }, []);

  const saveNote = useCallback(async () => {
    if (!selected || !noteDraft.trim()) return;
    const now = new Date();
    const savedAt = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " · " + now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const entryId = uid();
    // Write to Supabase
    await supabase.from("notes").insert({
      id:          entryId,
      customer_id: selected,
      user_id:     user.id,
      text:        noteDraft.trim(),
      saved_at:    savedAt,
    });
    dispatch({ type: "SAVE_NOTE", id: selected, text: noteDraft.trim(), savedAt, entryId });
    setNoteDraft("");
    setNoteSaved(true);
    addToast(snapCustomer?.name || "Customer", "success", "Note Added");
    setTimeout(() => setNoteSaved(false), 2000);
  }, [selected, noteDraft, user, addToast, snapCustomer]);

  // ── Edit ──

  const startEdit = useCallback((c) => {
    setEditForm({
      name:             c.name,
      year:             String(c.year),
      model:            c.model === "—" ? "" : c.model,
      trim:             (!c.trim  || c.trim  === "—") ? "" : c.trim,
      bank:             (!c.bank  || c.bank  === "—") ? "" : c.bank,
      term:             c.term  ? String(c.term)  : "",
      milesYearly:      c.milesYearly  ? Number(c.milesYearly).toLocaleString() : "",
      milesTerm:        c.milesTerm    ? Number(c.milesTerm).toLocaleString() : "",
      currentMiles:     String(c.currentMiles),
      monthlyPayment:   c.monthlyPayment ? String(c.monthlyPayment) : "",
      downPayment:      c.downPayment   ? String(c.downPayment)   : "",
      tradeEquity:      c.tradeEquity   ? String(c.tradeEquity)   : "",
      leaseEnd:         c.leaseEnd === "—" ? "" : c.leaseEnd,
      privateIncentive: c.privateIncentive > 0 ? String(c.privateIncentive) : "",
      incentiveExp:     c.incentiveExp === "—" ? "" : c.incentiveExp,
      hasAccident:      c.hasAccident || false,
    });
    setEditMode(true);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!selected || editSaving) return;
    setEditSaving(true);
    const form      = normalizeForm(editForm);
    const leaseEnd  = form.leaseEnd;
    const incentiveExp = form.incentiveExp;
    const updates = {
      name:                editForm.name?.trim()  || snapCustomer?.name,
      year:                form.year,
      model:               editForm.model?.trim() || "—",
      trim:                editForm.trim?.trim()  || "—",
      bank:                editForm.bank?.trim()  || "—",
      term:                form.term,
      milesYearly:         form.milesYearly,
      milesTerm:           form.milesTerm,
      currentMiles:        form.currentMiles,
      monthlyPayment:      form.monthlyPayment,
      downPayment:         form.downPayment,
      tradeEquity:         form.tradeEquity,
      leaseEnd,
      privateIncentive:    form.privateIncentive,
      incentiveExp,
      hasAccident:         editForm.hasAccident || false,
    };
    const { error } = await supabase.from("customers").update({
      name:              updates.name,
      year:              updates.year,
      model:             updates.model === "—" ? null : updates.model,
      trim:              updates.trim  === "—" ? null : updates.trim,
      bank:              updates.bank  === "—" ? null : updates.bank,
      term:              updates.term,
      miles_yearly:      updates.milesYearly,
      miles_term:        updates.milesTerm,
      current_miles:     updates.currentMiles,
      monthly_payment:   updates.monthlyPayment,
      down_payment:      updates.downPayment,
      trade_equity:      updates.tradeEquity,
      lease_end:         updates.leaseEnd === "—" ? null : updates.leaseEnd,
      private_incentive: updates.privateIncentive,
      incentive_exp:     updates.incentiveExp === "—" ? null : updates.incentiveExp,
      has_accident:      updates.hasAccident,
    }).eq("id", selected);
    setEditSaving(false);
    if (error) { console.error("Supabase save error:", JSON.stringify(error)); addToast("Save Failed", "error", error.message || "Please try again"); return; }
    // Build a human-readable summary of what changed
    const FIELD_LABELS = {
      name: "Name", year: "Year", model: "Model", trim: "Trim", bank: "Bank",
      term: "Lease Term", leaseEnd: "Lease End", milesYearly: "Miles / Year",
      milesTerm: "Miles / Term", currentMiles: "Odometer", monthlyPayment: "Monthly Payment",
      downPayment: "Down Payment", tradeEquity: "Trade Equity",
      privateIncentive: "Incentive", incentiveExp: "Incentive Expiry",
    };
    const changed = Object.keys(FIELD_LABELS).filter(k => {
      const oldVal = String(snapCustomer?.[k] ?? "").replace(/,/g,"").replace(/—/g,"");
      const newVal = String(updates[k] ?? "").replace(/,/g,"").replace(/—/g,"");
      return oldVal !== newVal && newVal !== "";
    });
    const changeStr = changed.length === 0
      ? "Updated"
      : changed.length === 1
      ? `${FIELD_LABELS[changed[0]]} Updated`
      : changed.length === 2
      ? `${FIELD_LABELS[changed[0]]} & ${FIELD_LABELS[changed[1]]} Updated`
      : `${changed.length} Fields Updated`;
    dispatch({ type: "UPDATE_CUSTOMER", id: selected, updates });
    setEditMode(false);
    setEditSaved(true);
    setTimeout(() => setEditSaved(false), 2000);
    addToast(updates.name, "success", changeStr);
  }, [selected, editForm, snapCustomer, addToast, editSaving]);

  // ── Add modal ──

  const openModal  = () => { setForm(EMPTY_FORM); setShowModal(true); setModalTab("pick"); setImportText(""); setImportError(""); };
  const closeModal = () => { setShowModal(false); setForm(EMPTY_FORM); setModalTab("pick"); setImportText(""); setImportError(""); };

  const isDuplicate = useMemo(() => {
    if (!form.name.trim()) return false;
    return customers.some(c => c.name.trim().toLowerCase() === form.name.trim().toLowerCase());
  }, [form.name, customers]);

  const handleParse = () => {
    setImportError("");
    if (!importText.trim()) return setImportError("Paste your DMS text first.");
    const parsed = parseDMS(importText);
    if (!parsed.isLease) return setImportError("This doesn't look like a lease — Lease/Purchase field may say 'Purchased' or 'Cash'. Only lease turn-ins can be imported.");
    if (!parsed.name)    return setImportError("Could not read customer name. Make sure you copied the full page.");
    // Map parsed values to form — keep selects compatible
    const milesYearlyFormatted = parsed.milesYearly
      ? Number(parsed.milesYearly).toLocaleString()
      : "";
    setForm({
      name:             titleCase(parsed.name),
      year:             parsed.year,
      model:            parsed.model,
      trim:             parsed.trim || "",
      bank:             parsed.bank,
      term:             parsed.term,
      milesYearly:      milesYearlyFormatted,
      milesTerm:        parsed.milesTerm ? Number(parsed.milesTerm).toLocaleString() : "",
      currentMiles:     "0",
      monthlyPayment:   parsed.monthlyPayment,
      downPayment:      parsed.downPayment,
      tradeEquity:      parsed.tradeEquity,
      leaseEnd:         parsed.leaseEnd,
      privateIncentive: "",
      incentiveExp:     "",
    });
    setModalTab("manual");
    setImportText("");
  };

  const handleAdd = async () => {
    const customer = buildCustomer(form);
    // Write to Supabase
    const { error } = await supabase.from("customers").insert({
      id:               customer.id,
      user_id:          user.id,
      name:             customer.name,
      year:             customer.year,
      model:            customer.model === "—" ? null : customer.model,
      trim:             customer.trim  === "—" ? null : customer.trim,
      bank:             customer.bank  === "—" ? null : customer.bank,
      term:             customer.term,
      miles_yearly:     customer.milesYearly,
      miles_term:       customer.milesTerm,
      current_miles:    customer.currentMiles,
      monthly_payment:  customer.monthlyPayment,
      down_payment:     customer.downPayment,
      trade_equity:     customer.tradeEquity,
      lease_end:        customer.leaseEnd === "—" ? null : customer.leaseEnd,
      private_incentive: customer.privateIncentive,
      incentive_exp:    customer.incentiveExp === "—" ? null : customer.incentiveExp,
      has_accident:     form.hasAccident || false,
      status:           customer.status,
    });
    if (!error) {
      dispatch({ type: "ADD_CUSTOMER", customer });
      closeModal();
      setSelected(customer.id);
      setSnapCustomer(customer);
      setNoteDraft("");
      setNotesOpen(false);
      setEditMode(false);
      setEditSaved(false);
      setPanelState("open");
      addToast(customer.name, "success", "Added");
    }
  };

  // ── Delete ──

  const confirmDelete = (id, e) => { e.stopPropagation(); setConfirmDel(id); };
  const executeDelete = async () => {
    const delName = customers.find(x => x.id === confirmDel)?.name || "Customer";
    if (confirmDel === selected) closePanel();
    await supabase.from("customers").delete().eq("id", confirmDel);
    dispatch({ type: "DELETE_CUSTOMER", id: confirmDel });
    setConfirmDel(null);
    addToast(delName, "info", "Deleted");
  };

  // ── Sort ──

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  // ── Derived ──

  const { filtered, urgentCount, soonCount, withIncentive, milesAtRisk } = useMemo(() => {
    const q = search.toLowerCase();
    let urgent = 0, soon = 0, incentive = 0, miles = 0;
    customers.forEach(c => {
      const ml = calcMonthsLeft(c.leaseEnd);
      const dl = calcDaysLeft(c.leaseEnd);
      if (ml === 0 && dl > 0) urgent++;
      else if (ml >= 1 && ml <= 3) soon++;
      if (c.privateIncentive > 0) incentive++;
      const mp = calcMileagePace(c);
      if (mp && (mp.status === "over" || mp.status === "warning")) miles++;
    });
    const all = customers
      .filter(c => {
        const sLabel = STATUS_MAP.get(c.status)?.label?.toLowerCase() || "";
        const searchable = [c.name, c.model, c.bank, c.trim, c.vin, sLabel].join(" ").toLowerCase();
        if (q && !searchable.includes(q)) return false;
        if (statFilter === 'urgent')    return calcMonthsLeft(c.leaseEnd) === 0 && calcDaysLeft(c.leaseEnd) > 0;
        if (statFilter === 'soon')      return calcMonthsLeft(c.leaseEnd) >= 1 && calcMonthsLeft(c.leaseEnd) <= 3;
        if (statFilter === 'incentive') return c.privateIncentive > 0;
        if (statFilter === 'miles') { const mp = calcMileagePace(c); return mp && (mp.status === 'over' || mp.status === 'warning'); }
        return true;
      })
      .sort((a, b) => {
        if (!sortKey) return 0;
        const av = a[sortKey], bv = b[sortKey];
        const aE = av === 0 || av === "" || av === "—";
        const bE = bv === 0 || bv === "" || bv === "—";
        if (aE && !bE) return 1;
        if (!aE && bE) return -1;
        if (aE && bE)  return 0;
        const cmp = sortKey === "status"
          ? (statusMeta(av).order ?? 0) - (statusMeta(bv).order ?? 0)
          : DATE_KEYS.has(sortKey)
          ? parseDateVal(av) - parseDateVal(bv)
          : typeof av === "string" ? av.localeCompare(bv) : av - bv;
        return sortDir === "asc" ? cmp : -cmp;
      });
    return { filtered: all, urgentCount: urgent, soonCount: soon, withIncentive: incentive, milesAtRisk: miles };
  }, [customers, search, sortKey, sortDir, statFilter]);

  const panelVisible = panelState !== "closed";
  const c = snapCustomer;

  // ── Keyboard navigation ──
  useEffect(() => {
    const handler = (e) => {
      // Don't intercept when typing in inputs/textareas
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "Escape") {
        if (editMode)       { setEditMode(false); return; }
        if (panelState === "open") { closePanel(); return; }
        if (showModal)      { setShowModal(false); return; }
        if (confirmDel)     { setConfirmDel(null); return; }
        if (statFilter)     { setStatFilter(null); return; }
      }

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (filtered.length === 0) return;
        const idx = filtered.findIndex(r => r.id === selected);
        let next;
        if (e.key === "ArrowDown") next = idx === -1 ? 0 : Math.min(idx + 1, filtered.length - 1);
        else                       next = idx === -1 ? filtered.length - 1 : Math.max(idx - 1, 0);
        openPanel(filtered[next].id);
      }

      if (e.key === "Enter" && selected && panelState === "open" && !editMode) {
        startEdit(snapCustomer);
      }

      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !showModal) {
        if (panelState === "open") {
          setNotesOpen(true);
          setTimeout(() => notesRef.current?.focus(), 50);
        } else {
          setShowModal(true);
          setModalTab("pick");
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filtered, selected, panelState, editMode, showModal, confirmDel, statFilter, snapCustomer, openPanel, closePanel, startEdit]);

  // ── Render ──

  if (dbLoading) return (
    <div style={{ minHeight:"100vh", background:"#0e1117", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ width:28, height:28, border:"2px solid #1e2535", borderTopColor:"#4a8fd4", borderRadius:"50%", animation:"spin 0.7s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <>
      <style>{css}</style>
      <div className={`app${isDayMode ? " day" : ""}${isWindows ? " win" : ""}`}>

        {/* SIDEBAR */}
        <aside className={`sidebar${sidebarCollapsed ? " collapsed" : ""}`}>

          {/* Brand mark */}
          <div className="sidebar-brand">
            <div className="sidebar-brand-mark">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 10L6 2L10 10M3.5 7.5h5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <span className="sidebar-brand-text">Meridian</span>
          </div>

          {/* Header — avatar + collapse */}
          <div className="sidebar-header">
            <div className="profile-btn" onClick={() => setShowSettings(true)} title="Account settings">
              <div className="profile-avatar" style={{ overflow: user?.avatarUrl ? "hidden" : undefined, padding: 0 }}>
                {user?.avatarUrl
                  ? <img src={user.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 7 }} />
                  : user ? user.name.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2) : "?"}
              </div>
              <span className="profile-name">{user?.name || "Account"}</span>
            </div>
            {!sidebarCollapsed && (
              <button className="sidebar-collapse-btn" onClick={() => setSidebarCollapsed(true)} title="Collapse sidebar">
                <ChevronLeft size={13} strokeWidth={2} />
              </button>
            )}
          </div>

          {/* Body — nav items */}
          <div className="sidebar-body">
            <div className="sidebar-section-label">Workspace</div>
            <div className={`nav-item ${activeView === "maturities" ? "active" : ""}`} onClick={() => setActiveView("maturities")}>
              <span className="nav-icon"><Layers size={14} strokeWidth={1.75} /></span>
              <span className="nav-item-label">Maturities</span>
              <span className="nav-count">{customers.length}</span>
            </div>
            <div className={`nav-item ${activeView === "timeline" ? "active" : ""}`} onClick={() => setActiveView("timeline")}>
              <span className="nav-icon"><CalendarRange size={14} strokeWidth={1.75} /></span>
              <span className="nav-item-label">Timeline</span>
            </div>

          </div>

          {/* Footer — logout + theme toggle + collapse toggle */}
          <div className="sidebar-footer">
            <div className="nav-item" style={{ flex: 1 }} onClick={signOut}>
              <span className="nav-icon"><LogOut size={14} strokeWidth={1.75} /></span>
              <span className="nav-item-label">Log Out</span>
            </div>
            <div className="theme-toggle" onClick={toggleTheme} title={isDayMode ? "Switch to Night" : "Switch to Day"}>
              <span className={`theme-icon ${themeAnimating ? "spinning" : ""}`}>
                {isDayMode ? <Sun size={13} strokeWidth={1.75} style={{ opacity: 0.6 }} /> : <Moon size={13} strokeWidth={1.75} style={{ opacity: 0.6 }} />}
              </span>
              <div className={`toggle-track ${isDayMode ? "on" : ""}`}><div className="toggle-thumb" /></div>
            </div>
            {sidebarCollapsed && (
              <button className="sidebar-collapse-btn" onClick={() => setSidebarCollapsed(false)} title="Expand sidebar">
                <ChevronRight size={13} strokeWidth={2} />
              </button>
            )}
          </div>

        </aside>

        {/* MAIN */}
        <div className="main-wrapper">
          {activeView === "timeline" ? <TimelineView customers={customers} isDayMode={isDayMode} openPanel={openPanel} openModal={openModal} /> : null}

          <div className="list-panel" style={{ display: activeView === "maturities" ? "flex" : "none" }}>

            <div className="topbar">
              <span className="topbar-title">Maturities</span>
              <div className="spacer" />
              <div className="topbar-divider" />
              <input className="search-box" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
              <button className="toolbar-btn" title="Export CSV" onClick={() => { exportCSV(filtered); addToast(`${filtered.length} customers exported`, "success"); }}>
                <Download size={12} strokeWidth={2} style={{ marginRight: 4 }} />Export
              </button>
              <div style={{ position: "relative" }} ref={densityRef}>
                <button className="density-btn" onClick={() => setDensityOpen(v => !v)}>
                  <AlignJustify size={12} strokeWidth={2} />
                  {density.charAt(0).toUpperCase() + density.slice(1)}
                </button>
                {densityOpen && (
                  <div className="density-menu">
                    {["compact","comfortable"].map(d => (
                      <div key={d} className={`density-option ${density === d ? "active" : ""}`} onClick={() => { setDensity(d); setDensityOpen(false); try { const p = JSON.parse(localStorage.getItem("lt-prefs") || "{}"); localStorage.setItem("lt-prefs", JSON.stringify({ ...p, density: d })); } catch {} }}>
                        {d.charAt(0).toUpperCase() + d.slice(1)}
                        {density === d && <Check size={11} strokeWidth={2.5} />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button className="btn-primary" onClick={openModal} title="Add new customer (N)"><UserPlus size={13} strokeWidth={2} />New Customer</button>
            </div>

            <div className="stats-bar">
              {[
                { value: customers.length, label: "Total",           color: null,       filter: null        },
                { value: urgentCount,      label: "Ending This Month", color: isDayMode ? "#1d4ed8" : "#7aa4e0", filter: 'urgent'    },
                { value: soonCount,        label: "Ending in 3 Months", color: isDayMode ? "#2563eb" : "#5a84c0", filter: 'soon'      },
                { value: withIncentive,    label: "With Incentive",  color: isDayMode ? "#3b82f6" : "#4a6ea8", filter: 'incentive' },
                { value: milesAtRisk,       label: "Miles At Risk",    color: isDayMode ? "#d97706" : "#f59e0b", filter: 'miles'     },
              ].map(({ value, label, color, filter }) => {
                const active = statFilter === filter;
                return (
                  <div className={`stat-item ${active ? "active" : ""}`} key={label}
                    onClick={() => setStatFilter(active ? null : filter)}
                    style={{ cursor: filter ? "pointer" : "default", opacity: statFilter && !active ? 0.45 : 1, transition: "opacity 0.15s", color: color || "var(--text-primary)" }}>
                    <AnimatedNumber className="stat-value" value={value} style={color ? { color } : {}} />
                    <span className="stat-label" style={active ? { color: color || "var(--text-primary)" } : {}}>{label}</span>
                  </div>
                );
              })}
            </div>

            <div className={`table-wrap density-${density}`}>
              <div className="col-headers">
                {COLUMNS.map(({ label, key }) => {
                  if (!key) return <div key="spacer" />;
                  const active = sortKey === key;
                  const Icon   = active ? (sortDir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
                  return (
                    <div key={key} className={`col-header ${active ? "active" : ""}`} onClick={() => handleSort(key)}>
                      {label}
                      <span className="sort-icon"><Icon size={10} strokeWidth={2} /></span>
                    </div>
                  );
                })}
              </div>

              {filtered.length === 0 ? (
                <div className="empty-state">
                  <svg className="empty-state-icon" width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="8" y="16" width="48" height="36" rx="4" stroke="currentColor" strokeWidth="2" fill="none"/>
                    <path d="M8 24h48" stroke="currentColor" strokeWidth="2"/>
                    <path d="M20 34h8M20 40h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <circle cx="46" cy="37" r="6" stroke="currentColor" strokeWidth="2" fill="none"/>
                    <path d="M50.2 41.2l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  <span className="empty-state-title">No customers found</span>
                  <span className="empty-state-sub">{search ? `No results for "${search}"` : statFilter === "urgent" ? "No leases ending this month" : statFilter === "soon" ? "No leases ending in 3 months" : statFilter === "incentive" ? "No customers with active incentives" : statFilter === "miles" ? "No customers with mileage risk" : "Add a customer to get started"}</span>
                </div>
              ) : filtered.map(row => {
                const monthsLeft          = calcMonthsLeft(row.leaseEnd);
                const incentiveMonthsLeft = calcMonthsLeft(row.incentiveExp);
                const mc     = monthsColor(monthsLeft, isDayMode);
                const imc    = monthsColor(incentiveMonthsLeft, isDayMode);
                const lDays  = monthsLeft === 0 ? calcDaysLeft(row.leaseEnd) : 0;
                const iDays  = incentiveMonthsLeft === 0 ? calcDaysLeft(row.incentiveExp) : 0;
                const lRaw   = rawDaysLeft(row.leaseEnd);
                const lLabel = formatTimeLeft(monthsLeft, lDays, lRaw);
                const iLabel = formatTimeLeft(incentiveMonthsLeft, iDays);
                const urgent  = monthsLeft === 0 && lRaw >= 0;
                const expired = lRaw < 0;
                const rowMp  = calcMileagePace(row); // compute once per row

                return (
                  <div
                    key={row.id}
                    className={`customer-row ${selected === row.id ? "selected" : ""} ${expired ? "row-expired" : urgent ? "row-urgent" : ""}`}
                    onClick={() => handleRowClick(row.id)}
                  >
                    <span className="cell-name">
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</span>
                      {notes[row.id]?.history?.length > 0 && (
                        <span className="notes-count-badge">{notes[row.id].history.length}</span>
                      )}
                    </span>
                    <span className="cell-year">{row.year}</span>
                    <span className="cell-model">{row.model}</span>
                    <span className={`cell-incentive ${row.privateIncentive === 0 ? "none" : ""}`} style={{ color: incentiveColor(row.privateIncentive, isDayMode) }}>
                      {row.privateIncentive > 0 ? `$${Number(row.privateIncentive).toLocaleString()}` : "—"}
                    </span>
                    <span className="cell-incentive-exp" style={{ opacity: row.privateIncentive === 0 ? 0.25 : 1 }}>{row.incentiveExp}</span>
                    <span className="months-badge" style={{ opacity: row.privateIncentive === 0 ? 0.25 : 1, color: (incentiveMonthsLeft > 0 || iDays > 0) && row.incentiveExp !== "—" ? imc : (isDayMode ? "#8090a8" : "#364050") }}>
                      {(() => { const d = row.privateIncentive > 0 && row.incentiveExp !== "—" ? calcDaysLeft(row.incentiveExp) : null; const show = d !== null && d <= 30 && d > 0; return <span className="incentive-warn-dot" title={show ? `Expires in ${d} days` : ""} style={{ visibility: show ? "visible" : "hidden" }} />; })()}
                      {row.incentiveExp !== "—" && (incentiveMonthsLeft > 0 || iDays > 0) ? iLabel : "—"}
                    </span>
                    <span className="cell-lease-end">{row.leaseEnd}</span>
                    <span className="months-badge" style={{ color: mc }}>{lLabel}</span>
                    {(() => {
                      const sm = statusMeta(row.status);
                      const milesOver = rowMp && rowMp.status === "over";
                      const milesWarn = rowMp && rowMp.status === "warning";
                      return (
                        <div className="status-cell">
                          <span className="status-pill" style={{ background: sm.color + "22", borderColor: sm.color + "55", color: sm.color, flexShrink: 0 }}>
                            <span className="status-dot" style={{ background: sm.color }} />
                            {sm.short ?? sm.label}
                          </span>
                          {milesOver && <span className="signal-tag miles">Miles Over</span>}
                          {!milesOver && milesWarn && <span className="signal-tag miles-warn">Miles Risk</span>}
                          {row.hasAccident && <span className="signal-tag accident">Accident</span>}
                        </div>
                      );
                    })()}
                    <div style={{ position: "relative" }}>
                      <div className="row-actions" onClick={e => e.stopPropagation()}>
                        <button className="row-action-btn" title="Edit"
                          onClick={e => { e.stopPropagation(); openPanel(row.id, true); }}>
                          <Pencil size={11} strokeWidth={2} />
                        </button>
                        <button className="row-action-btn danger" title="Delete" onClick={e => confirmDelete(row.id, e)}>
                          <Trash2 size={11} strokeWidth={2} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>


        </div>

                    {/* DETAIL PANEL */}
          {panelVisible && c && (
            <>
              <div className="detail-backdrop" onClick={closePanel} />
              <div className={`detail-panel ${panelState === "closing" ? "exit" : "enter"}`}>

                <div className="detail-topbar">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="detail-lead-name">{c.name}</div>
                    {(c.year || c.model || c.trim) && (
                      <div className="detail-lead-sub">
                        {[c.year, c.model, (c.trim && c.trim !== "—") ? c.trim : null].filter(Boolean).join(" ")}
                      </div>
                    )}
                  </div>
                  <div className="detail-topbar-actions">
                    {editMode && (
                      <button className="detail-edit-btn" onClick={() => setEditMode(false)}>Cancel</button>
                    )}
                    <button className={`detail-edit-btn ${editMode ? "active" : ""} ${editSaved ? "saved" : ""}`}
                      onClick={() => editMode ? saveEdit() : startEdit(c)}
                      disabled={editSaving}>
                      {editSaving ? "Saving…" : editSaved ? <><Check size={11} strokeWidth={2.5} /> Saved</> : editMode ? <><Check size={11} strokeWidth={2.5} /> Save</> : <><Pencil size={11} strokeWidth={2} /> Edit</>}
                    </button>
                    <button className="detail-edit-btn" title="Print / Export PDF" onClick={() => printCustomer(c, notes)} style={{ gap: 4 }}>
                      <Printer size={11} strokeWidth={2} /> Print
                    </button>
                    <button className="detail-close" onClick={closePanel}><X size={14} strokeWidth={2} /></button>
                  </div>
                </div>

                {/* Status selector */}
                <div className="status-selector">
                  <div className="status-selector-label">Status</div>
                  <div className="status-options">
                    {STATUSES.map(s => {
                      const active = (c.status || "early") === s.key;
                      return (
                        <button
                          key={s.key}
                          className={`status-option ${active ? "active" : ""} ${flashingStatus === s.key ? "flashing" : ""}`}
                          style={active ? { background: s.color, borderColor: s.color } : {}}
                          onClick={async () => {
                          if (active) return; // already this status
                          const prevLabel = statusMeta(c.status || "early").label;
                          const { error: sErr } = await supabase.from("customers").update({ status: s.key }).eq("id", selected);
                          if (sErr) { addToast("Update Failed", "error", "Status could not be changed"); return; }
                          dispatch({ type: "SET_STATUS", id: selected, status: s.key });
                          addToast(c.name, "success", `→ ${s.label}`);
                          setFlashingStatus(s.key);
                          setTimeout(() => setFlashingStatus(null), 350);
                        }}
                        >
                          <span className="status-dot" style={{ background: active ? (isDayMode ? "#ffffff" : "#0c0c0e") : s.color }} />
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {(() => {
                  const moClass = (() => {
                    const ml = calcMonthsLeft(c.leaseEnd);
                    return ml <= 1 ? "urgent" : ml <= 3 ? "warning" : ml <= 5 ? "caution" : "";
                  })();
                  const fmt$    = (n) => n > 0 ? `$${Number(n).toLocaleString()}` : "—";
                  const fmtMi   = (n) => n > 0 ? Number(n).toLocaleString() : "—";
                  const dollarKeys = ["monthlyPayment","downPayment","tradeEquity","privateIncentive"];
                  const selectOpts = {
                    bank:            ["VW Credit","Ally","Affinity","Cal"],
                    term:            ["24","36","39","42","48"],
                    year:            Array.from({length:7},(_,i)=>String(new Date().getFullYear()+1-i)),
                    model:           ["Atlas","Taos","Jetta","Tiguan","GLI","Cross Sport","GTI","Golf R"],
                    trim:            ["S","SE","SE Black","SEL","SE Tech","SEL Premium R-Line","SEL Premium R-Line Turbo"],
                    privateIncentive:["750","1000","1250","1500","1750","2000","2250","2500"],
                    milesYearly:     ["7,500","10,000","12,000","15,000","20,000"],
                  };
                  const editField = (key) => {
                    if (selectOpts[key]) return (
                      <select className="meta-input" value={editForm[key] ?? ""} onChange={e => {
                        const val = e.target.value;
                        if (key === "term") {
                          const yearly = parseFloat((editForm.milesYearly ?? "").replace(/,/g,""));
                          const termMiles = yearly && val ? Math.round((yearly/12)*parseInt(val)).toLocaleString() : "";
                          setEditForm(p => ({ ...p, term: val, milesTerm: termMiles }));
                        } else if (key === "milesYearly") {
                          const yearly = parseFloat(val.replace(/,/g,""));
                          const term = parseInt(editForm.term ?? "");
                          const termMiles = yearly && term ? Math.round((yearly/12)*term).toLocaleString() : "";
                          setEditForm(p => ({ ...p, milesYearly: val, milesTerm: termMiles }));
                        } else {
                          setEditForm(p => ({ ...p, [key]: val }));
                        }
                      }}>
                        <option value="">—</option>
                        {selectOpts[key].map(o => <option key={o} value={o}>{key==="privateIncentive"?`$${o}`:o}</option>)}
                      </select>
                    );
                    if (key === "milesTerm") return (
                      <input className="meta-input" value={editForm[key] ?? ""} readOnly style={{ opacity: 0.6, cursor: "default" }} />
                    );
                    if (dollarKeys.includes(key)) return (
                      <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 11.5, color: "var(--text-secondary)", pointerEvents: "none" }}>$</span>
                        <input className="meta-input" value={editForm[key] ?? ""} onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))} onBlur={e => { const f = formatDollar(e.target.value); if (f) setEditForm(p => ({ ...p, [key]: f })); }} style={{ paddingLeft: 16 }} />
                      </div>
                    );
                    if (key === "incentiveExp") return (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                        <select className="meta-input" value={(editForm.incentiveExp ?? "").split(" ")[0] || ""} onChange={e => {
                          const day = (editForm.incentiveExp ?? "").split(" ")[1] || "";
                          setEditForm(p => ({ ...p, incentiveExp: e.target.value ? `${e.target.value}${day ? " " + day : ""}` : "" }));
                        }}>
                          <option value="">Mo.</option>
                          {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <select className="meta-input" value={(editForm.incentiveExp ?? "").split(" ")[1] || ""} onChange={e => {
                          const mo = (editForm.incentiveExp ?? "").split(" ")[0] || "";
                          setEditForm(p => ({ ...p, incentiveExp: mo ? `${mo} ${e.target.value}` : "" }));
                        }}>
                          <option value="">Day</option>
                          {Array.from({length: 31}, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                    );
                    return <input className="meta-input" value={editForm[key] ?? ""} onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))} />;
                  };
                  const cell = ({ label, val, key, cls, empty }) => (
                    <div className="detail-meta-cell" key={label || "spacer"} style={empty ? { background: isDayMode ? "var(--bg-input)" : "#13131a" } : {}}>
                      {!empty && <span className="detail-meta-label">{label}</span>}
                      {!empty && (editMode && key
                        ? editField(key)
                        : <span className={`detail-meta-value ${cls}`}>{val}</span>
                      )}
                    </div>
                  );
                  return (
                    <>
                      <div className="detail-meta-grid-wrap">
                      <div className="detail-meta-grid">
                        {[
                          { label: "Name",              val: c.name,                         key: "name",           cls: "" },
                          { label: "Year",              val: c.year ? String(c.year) : "—",   key: "year",           cls: "" },
                          { label: "Model",             val: c.model || "—",                 key: "model",          cls: "" },
                          { label: "Trim",              val: (c.trim && c.trim !== "—") ? c.trim : "—", key: "trim", cls: "" },
                          { label: "Bank",              val: c.bank || "—",                  key: "bank",           cls: "" },
                          { label: "Term",              val: c.term ? `${c.term} mo` : "—",  key: "term",           cls: "" },
                          { label: "Lease End",         val: c.leaseEnd,                     key: "leaseEnd",       cls: "" },
                          { label: "Months Remaining",     val: (() => { const m = calcMonthsLeft(c.leaseEnd); const d = m < 1 ? calcDaysLeft(c.leaseEnd) : 0; return formatTimeLeft(m, d); })(), key: null, cls: moClass },
                          { label: "Monthly Payment",   val: fmt$(c.monthlyPayment),          key: "monthlyPayment", cls: c.monthlyPayment > 0 ? "blue" : "dim" },
                          { label: "Down Payment",      val: fmt$(c.downPayment),             key: "downPayment",    cls: c.downPayment  > 0 ? "blue" : "dim" },
                          { label: "Trade Equity",      val: c.tradeEquity > 0 ? `$${Number(c.tradeEquity).toLocaleString()}` : "$0", key: "tradeEquity", cls: c.tradeEquity > 0 ? "blue" : "dim" },
                          { label: "Incentive Value",   val: c.privateIncentive > 0 ? `$${c.privateIncentive.toLocaleString()}` : "—", key: "privateIncentive", cls: c.privateIncentive > 0 ? "blue" : "dim" },
                          { label: "Incentive Expires", val: (() => {
                            if (!c.incentiveExp || c.incentiveExp === "—") return "—";
                            const FULL_MONTHS = { Jan:"January", Feb:"February", Mar:"March", Apr:"April", May:"May", Jun:"June", Jul:"July", Aug:"August", Sep:"September", Oct:"October", Nov:"November", Dec:"December" };
                            return c.incentiveExp.replace(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i, m => FULL_MONTHS[m] || m);
                          })(), key: "incentiveExp", cls: "" },
                          { label: "Incentive Remaining",     val: (() => {
                              if (!c.incentiveExp || c.incentiveExp === "—") return "—";
                              const m = calcMonthsLeft(c.incentiveExp);
                              const d = calcDaysLeft(c.incentiveExp);
                              if (m === 0 && d <= 0) return "—";
                              return formatTimeLeft(m, d);
                            })(), key: null, cls: "" },
                          { label: "Miles / Year",      val: fmtMi(c.milesYearly),           key: "milesYearly",    cls: "" },
                          { label: "Miles / Term",      val: fmtMi(c.milesTerm),             key: "milesTerm",      cls: "" },
                          { label: "Odometer",          val: formatMiles(c.currentMiles),    key: "currentMiles",   cls: "" },
                          { label: "Mileage Pace", val: (() => {
                              const mp = calcMileagePace(c);
                              if (!mp) return "—";
                              if (mp.status === "ok") return `On pace (proj. ${mp.projectedTotal.toLocaleString()} mi)`;
                              if (mp.status === "over") return `Over by ~${Math.abs(mp.overage).toLocaleString()} mi`;
                              if (mp.status === "warning") return `On pace to exceed by ~${mp.overage.toLocaleString()} mi`;
                              return "—";
                            })(), key: null, cls: (() => {
                              const mp = calcMileagePace(c);
                              if (!mp || mp.status === "ok") return "dim";
                              if (mp.status === "over") return "urgent";
                              return "warning";
                            })() },
                        ].map(cell)}
                      </div>
                      </div>

                      {/* Accident flag — in edit mode always visible, in view mode only if flagged */}
                      {(editMode || c.hasAccident) && (
                        <div
                          className="accident-toggle"
                          onClick={() => { if (editMode) setEditForm(p => ({ ...p, hasAccident: !p.hasAccident })); }}
                          style={{ borderTop: "1px solid var(--border-main)", cursor: editMode ? "pointer" : "default" }}
                        >
                          <div className={`accident-checkbox${(editMode ? editForm.hasAccident : c.hasAccident) ? " checked" : ""}`}>
                            {(editMode ? editForm.hasAccident : c.hasAccident) && (
                              <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                                <path d="M1.5 4.5l2.5 2.5 3.5-4" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>
                          <span className="accident-label" style={{ color: (editMode ? editForm.hasAccident : c.hasAccident) ? (isDayMode ? "#dc2626" : "#ef4444") : undefined }}>
                            Accident Reported
                          </span>
                        </div>
                      )}
                    </>
                  );
                })()}

                <div className="detail-body">
                  <div className="detail-body-inner">
                  <div className="detail-notes">
                    <span className="notes-label">Notes{notes[selected]?.history?.length > 0 && <span className="notes-count-badge" style={{ marginLeft: 6 }}>{notes[selected].history.length}</span>}</span>

                    {/* Compose area */}
                    {!notesOpen && !(notes[selected]?.history?.length) ? (
                      <div className="notes-empty" onClick={openNotes}>
                        <span className="notes-empty-icon"><Pencil size={15} strokeWidth={1.5} style={{ opacity: 0.3 }} /></span>
                        <span className="notes-empty-text">No notes yet</span>
                        <span className="notes-empty-hint">Click to add a note</span>
                      </div>
                    ) : (
                      <>
                        <textarea
                          ref={notesRef}
                          className="notes-textarea"
                          placeholder="Add a new note..."
                          value={noteDraft}
                          onChange={e => setNoteDraft(e.target.value)}
                          onKeyDown={e => { if (e.metaKey && e.key === "Enter") saveNote(); }}
                        />
                        <div className="notes-footer">
                          <span className="notes-saved-at">
                            {noteSaved
              ? <span style={{ color: isDayMode ? "#16a34a" : "#2a8f4e" }}>✓ Saved</span>
              : <span style={{ display:"flex", alignItems:"center", gap:4 }}>
                  <kbd className="kbd">⌘</kbd>
                  <kbd className="kbd">↵</kbd>
                  <span>to save</span>
                </span>
            }
                          </span>
                          <button
                            className="notes-save-btn"
                            onClick={saveNote}
                            disabled={!noteDraft.trim()}
                          >
                            Add Note
                          </button>
                        </div>

                        {/* History log */}
                        {notes[selected]?.history?.length > 0 && (
                          <div className="notes-history">
                            {notes[selected].history.map((entry) => (
                              <div key={entry.id} className="note-entry">
                                <div className="note-timeline-col">
                                  <div className="note-timeline-dot" />
                                  <div className="note-timeline-line" />
                                </div>
                                <div className="note-entry-body">
                                  <div className="note-entry-header">
                                    <span className="note-entry-time">{entry.savedAt}</span>
                                    <button
                                      className="note-entry-delete"
                                      title="Delete note"
                                      onClick={async () => {
                                      await supabase.from("notes").delete().eq("id", entry.id);
                                      dispatch({ type: "DELETE_NOTE_ENTRY", id: selected, entryId: entry.id });
                                    }}
                                    >
                                      <X size={10} strokeWidth={2} />
                                    </button>
                                  </div>
                                  <p className="note-entry-text">{entry.text}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  </div>
                  <div className="detail-scroll-fade" />
                </div>

              </div>
            </>
          )}

        {/* ADD CUSTOMER MODAL */}
        {showModal && (
          <div className="modal-overlay" onClick={closeModal}>
            <div className="modal" onClick={e => e.stopPropagation()}>

              {/* ── STEP 0: Picker ── */}
              {modalTab === "pick" && (
                <>
                  <div className="modal-topbar" style={{ borderBottom:"none", paddingBottom:8 }}>
                    <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                      <span style={{ fontSize:14, fontWeight:500, color:"var(--text-primary)", letterSpacing:"-0.2px" }}>New Customer</span>
                      <span style={{ fontSize:11, color:"var(--text-secondary)" }}>How would you like to add them?</span>
                    </div>
                    <button className="modal-close" onClick={closeModal}><X size={14} strokeWidth={2} /></button>
                  </div>
                  <div style={{ display:"flex", gap:10, padding:"8px 18px 20px" }}>
                    <button className="import-pick-card" onClick={() => setModalTab("manual")}>
                      <div className="import-pick-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </div>
                      <div style={{ fontSize:13, fontWeight:500, color:"var(--text-primary)", letterSpacing:"-0.1px" }}>Enter manually</div>
                      <div style={{ fontSize:11, color:"var(--text-secondary)" }}>Fill in each field yourself</div>
                    </button>
                    <button className="import-pick-card" onClick={() => setModalTab("import")}>
                      <div className="import-pick-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="8 17 12 21 16 17"/>
                          <line x1="12" y1="12" x2="12" y2="21"/>
                          <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/>
                        </svg>
                      </div>
                      <div style={{ fontSize:13, fontWeight:500, color:"var(--text-primary)", letterSpacing:"-0.1px" }}>Quick Import</div>
                      <div style={{ fontSize:11, color:"var(--text-secondary)" }}>Paste from CRM to auto-fill</div>
                    </button>
                  </div>
                </>
              )}

              {/* ── STEP 1a: Import tab ── */}
              {modalTab === "import" && (
                <>
                  <div className="modal-topbar" style={{ paddingBottom:12 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <button onClick={() => setModalTab("pick")} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text-secondary)", display:"flex", alignItems:"center", padding:0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                      </button>
                      <span style={{ fontSize:14, fontWeight:500, color:"var(--text-primary)", letterSpacing:"-0.2px" }}>Quick Import</span>
                    </div>
                    <button className="modal-close" onClick={closeModal}><X size={14} strokeWidth={2} /></button>
                  </div>
                  <div className="modal-body" style={{ display:"flex", flexDirection:"column", gap:12 }}>

                    <textarea
                      autoFocus
                      placeholder="Paste CRM data here..."
                      value={importText}
                      onChange={e => { setImportText(e.target.value); setImportError(""); }}
                      style={{ width:"100%", height:180, background:"var(--bg-input)", border:"1px solid var(--border-input)", borderRadius:7, padding:"10px 12px", fontSize:12, fontFamily:"inherit", color:"var(--text-primary)", resize:"none", outline:"none", lineHeight:1.5, transition:"border-color 0.15s, box-shadow 0.15s" }}
                      onFocus={e => { e.target.style.borderColor="var(--border-input-focus)"; }}
                      onBlur={e => e.target.style.borderColor="var(--border-input)"}
                    />
                    {importError && (
                      <div style={{ fontSize:11.5, background:"var(--bg-confirm)", border:"1px solid var(--border-confirm)", borderRadius:6, padding:"8px 12px", lineHeight:1.5, color: isDayMode ? "#dc2626" : "#f87171" }}>
                        ⚠ {importError}
                      </div>
                    )}
                    <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
                      <button className="btn-secondary" onClick={closeModal}>Cancel</button>
                      <button className="btn-primary" onClick={handleParse} disabled={!importText.trim()}>
                        Parse &amp; Fill Form
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* ── STEP 1b: Manual tab ── */}
              {modalTab === "manual" && (
                <>
                  <div className="modal-topbar" style={{ paddingBottom:12 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <button onClick={() => setModalTab("pick")} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text-secondary)", display:"flex", alignItems:"center", padding:0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                      </button>
                      <span style={{ fontSize:14, fontWeight:500, color:"var(--text-primary)", letterSpacing:"-0.2px" }}>
                        {form.name ? form.name : "New Customer"}
                      </span>
                    </div>
                    <button className="modal-close" onClick={closeModal}><X size={14} strokeWidth={2} /></button>
                  </div>
                  <div className="modal-body">
                    {/* Name */}
                    <div className="modal-row cols-1">
                      <div className="modal-field">
                        <label>Full Name</label>
                        <input
                          placeholder="e.g. Christina Barile"
                          value={form.name}
                          autoFocus
                          onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                          onBlur={e => setForm(p => ({ ...p, name: titleCase(e.target.value) }))}
                          onKeyDown={e => { if (e.key === "Escape") closeModal(); if (e.key === "Enter") handleAdd(); }}
                        />
                      </div>
                    </div>
                    <div className="modal-divider" />
                {/* Row 1 — Vehicle */}
                <div className="modal-row cols-3">
                  <div className="modal-field">
                    <label>Year</label>
                    <select value={form.year ?? ""} onChange={e => setForm(p => ({ ...p, year: e.target.value }))}>
                      <option value="">—</option>
                      {Array.from({length:7},(_,i)=>String(new Date().getFullYear()+1-i)).map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div className="modal-field">
                    <label>Model</label>
                    <select value={form.model ?? ""} onChange={e => setForm(p => ({ ...p, model: e.target.value }))}>
                      <option value="">—</option>
                      {["Atlas","Taos","Jetta","Tiguan","GLI","Cross Sport","GTI","Golf R"].map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="modal-field">
                    <label>Trim</label>
                    <select value={form.trim ?? ""} onChange={e => setForm(p => ({ ...p, trim: e.target.value }))}>
                      <option value="">—</option>
                      {["S","SE","SE Black","SEL","SE Tech","SEL Premium R-Line","SEL Premium R-Line Turbo"].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div className="modal-divider" />
                {/* Row 2 — Lease Terms */}
                <div className="modal-row cols-3" style={{ marginBottom: 8 }}>
                  <div className="modal-field">
                    <label>Bank</label>
                    <select value={form.bank ?? ""} onChange={e => setForm(p => ({ ...p, bank: e.target.value }))}>
                      <option value="">—</option>
                      {["VW Credit","Ally","Affinity","Cal"].map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div className="modal-field">
                    <label>Term (mo.)</label>
                    <select value={form.term ?? ""} onChange={e => {
                      const term = e.target.value;
                      const yearly = parseFloat((form.milesYearly ?? "").replace(/,/g, ""));
                      const termMiles = yearly && term ? Math.round((yearly / 12) * parseInt(term)).toLocaleString() : "";
                      setForm(p => ({ ...p, term, milesTerm: termMiles }));
                    }}>
                      <option value="">—</option>
                      {["24","36","39","42","48"].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="modal-field">
                    <label>Lease End</label>
                    <input placeholder="Apr 2026" value={form.leaseEnd ?? ""} onChange={e => setForm(p => ({ ...p, leaseEnd: e.target.value }))} onKeyDown={e => { if (e.key === "Escape") closeModal(); }} />
                  </div>
                </div>
                <div className="modal-row cols-3">
                  {[{ label: "Monthly Payment", key: "monthlyPayment", ph: "399" }, { label: "Down Payment", key: "downPayment", ph: "2,000" }, { label: "Trade Equity", key: "tradeEquity", ph: "1,500" }].map(({ label, key, ph }) => (
                    <div className="modal-field" key={key}>
                      <label>{label}</label>
                      <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "var(--text-secondary)", pointerEvents: "none" }}>$</span>
                        <input placeholder={ph} value={form[key] ?? ""} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} onBlur={e => { const f = formatDollar(e.target.value); if (f) setForm(p => ({ ...p, [key]: f })); }} onKeyDown={e => { if (e.key === "Escape") closeModal(); }} style={{ paddingLeft: 18 }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="modal-divider" />
                {/* Row 3 — Incentive */}
                <div className="modal-row cols-2">
                  <div className="modal-field">
                    <label>Incentive Value</label>
                    <select value={form.privateIncentive ?? ""} onChange={e => setForm(p => ({ ...p, privateIncentive: e.target.value }))}>
                      <option value="">—</option>
                      {["750","1000","1250","1500","1750","2000","2250","2500"].map(v => <option key={v} value={v}>${v}</option>)}
                    </select>
                  </div>
                  <div className="modal-field">
                    <label>Incentive Expires</label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      <select value={(form.incentiveExp ?? "").split(" ")[0] || ""} onChange={e => {
                        const day = (form.incentiveExp ?? "").split(" ")[1] || "";
                        setForm(p => ({ ...p, incentiveExp: e.target.value ? `${e.target.value}${day ? " " + day : ""}` : "" }));
                      }}>
                        <option value="">Mo.</option>
                        {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <select value={(form.incentiveExp ?? "").split(" ")[1] || ""} onChange={e => {
                        const mo = (form.incentiveExp ?? "").split(" ")[0] || "";
                        setForm(p => ({ ...p, incentiveExp: mo ? `${mo} ${e.target.value}` : "" }));
                      }}>
                        <option value="">Day</option>
                        {Array.from({length: 31}, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="modal-divider" />
                {/* Row 4 — Mileage */}
                <div className="modal-row cols-3">
                  <div className="modal-field">
                    <label>Yearly Allowance</label>
                    <select value={form.milesYearly ?? ""} onChange={e => {
                      const yearly = parseFloat(e.target.value.replace(/,/g, ""));
                      const term = parseInt(form.term ?? "");
                      const termMiles = yearly && term ? Math.round((yearly / 12) * term).toLocaleString() : "";
                      setForm(p => ({ ...p, milesYearly: e.target.value, milesTerm: termMiles }));
                    }}>
                      <option value="">—</option>
                      {["7,500","10,000","12,000","15,000","20,000"].map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="modal-field">
                    <label>Term Allowance</label>
                    <input placeholder="Auto-calculated" value={form.milesTerm ?? ""} readOnly style={{ opacity: 0.6, cursor: "default" }} />
                  </div>
                  <div className="modal-field">
                    <label>Current Odometer</label>
                    <input placeholder="28,400" value={form.currentMiles ?? ""} onChange={e => setForm(p => ({ ...p, currentMiles: e.target.value }))} onKeyDown={e => { if (e.key === "Escape") closeModal(); }} />
                  </div>
                </div>
                </div>

                {/* Accident flag */}
                <div
                  style={{ padding: "10px 18px", borderTop: "1px solid var(--border-main)", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}
                  onClick={() => setForm(p => ({ ...p, hasAccident: !p.hasAccident }))}
                >
                  <div className={`accident-checkbox${form.hasAccident ? " checked" : ""}`} style={{ flexShrink: 0 }}>
                    {form.hasAccident && (
                      <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                        <path d="M1.5 4.5l2.5 2.5 3.5-4" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <span className="accident-label" style={{ color: form.hasAccident ? (isDayMode ? "#dc2626" : "#ef4444") : undefined }}>
                    Accident Reported
                  </span>
                </div>

                <div className="modal-footer">
                  {isDuplicate && (
                    <span style={{ fontSize: 11, color: isDayMode ? "#b45309" : "#f59e0b", flex: 1, display: "flex", alignItems: "center", gap: 5 }}>
                      ⚠ A customer named "{form.name.trim()}" already exists
                    </span>
                  )}
                  <button className="btn-secondary" onClick={closeModal}>Cancel</button>
                  <button className="btn-primary" onClick={handleAdd} disabled={isDuplicate} style={isDuplicate ? { opacity: 0.4, cursor: "not-allowed" } : {}}>Add Customer</button>
                </div>
                </>
              )}

            </div>
          </div>
        )}

        {/* SETTINGS MODAL */}
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

        {/* CONFIRM DISCARD */}
        {confirmDiscard && (
          <div className="confirm-overlay" onClick={() => setConfirmDiscard(null)}>
            <div className="confirm-box" onClick={e => e.stopPropagation()}>
              <div className="confirm-title">Discard unsaved changes?</div>
              <div className="confirm-sub">Your edits haven't been saved.</div>
              <div className="confirm-actions">
                <button className="btn-secondary" onClick={() => setConfirmDiscard(null)}>Keep Editing</button>
                <button className="btn-danger" onClick={() => { setConfirmDiscard(null); setEditMode(false); confirmDiscard.action(); }}>Discard</button>
              </div>
            </div>
          </div>
        )}

        {/* CONFIRM DELETE */}
        {confirmDel && (() => {
          const del = customers.find(x => x.id === confirmDel);
          return (
            <div className="confirm-overlay" onClick={() => setConfirmDel(null)}>
              <div className="confirm-box" onClick={e => e.stopPropagation()}>
                <div className="confirm-title">Delete {del?.name}?</div>
                <div className="confirm-sub">This will permanently remove {del?.name} and all their notes. This can't be undone.</div>
                <div className="confirm-actions">
                  <button className="btn-secondary" onClick={() => setConfirmDel(null)}>Cancel</button>
                  <button className="btn-danger" onClick={executeDelete}>Delete</button>
                </div>
              </div>
            </div>
          );
        })()}

      </div>
      <ToastContainer toasts={toasts} isDayMode={isDayMode} />
    </>
  );
}
