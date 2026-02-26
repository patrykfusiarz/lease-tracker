import { useReducer, useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "./auth";
import { SettingsModal } from "./SettingsModal";
import { supabase } from "./supabase";
import { Layers, LogOut, UserPlus, X, ChevronsUpDown, ChevronUp, ChevronDown, Pencil, Check, Trash2, Sun, Moon, ChevronLeft, ChevronRight, AlignJustify, Settings } from "lucide-react";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

const GRID = "2fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr 56px";

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
  { key: "lease_return",  label: "Lease Return", color: "#3a7a9a", order: 5 },
  { key: "buyout",        label: "Buy Out",      color: "#4a5ab0", order: 6 },
  { key: "lost",          label: "Lost Deal",    color: "#9a4050", order: 7 },
];

function statusMeta(key) {
  return STATUSES.find(s => s.key === key) || STATUSES[0];
}
const STORAGE_KEY = "lease-tracker-v6";
const EMPTY_FORM = {
  name: "", year: "", model: "", trim: "", bank: "",
  term: "", milesYearly: "", milesTerm: "", currentMiles: "",
  monthlyPayment: "", downPayment: "", tradeEquity: "",
  leaseEnd: "", privateIncentive: "", incentiveExp: "", status: "early",
};

// ── HELPERS ───────────────────────────────────────────────────────────────────

function uid() { return crypto.randomUUID(); }

// ── DMS paste parser ──────────────────────────────────────────────────────────
function parseDMS(raw) {
  // Normalize: collapse tabs and multiple spaces into single space, keep newlines
  const text = raw.replace(/[ \t]+/g, " ").replace(/\r/g, "");
  const get = (re) => { const m = text.match(re); return m ? m[1].trim() : ""; };
  const money = (s) => s ? s.replace(/[$,]/g, "").trim() : "";

  // Name — first line, everything before first " - Purchase Information"
  // Handles: "CHRISTINA BARILE   -  Purchase Information"
  // Also handles leading whitespace
  const firstLine = (text.split("\n")[0] || "").trim();
  const nameMatch = firstLine.match(/^([A-Z][A-Z\s]+?)\s{1,}-/);
  const name = nameMatch ? nameMatch[1].trim() : firstLine.split(/\s*-\s*/)[0].trim();

  // Vehicle — between "Vehicle Purchased:" and "VIN:"
  const vpMatch = text.match(/Vehicle Purchased:\s*([\s\S]+?)(?=VIN:)/);
  const vehicleRaw = vpMatch ? vpMatch[1].replace(/\s+/g, " ").trim() : "";
  const yearMatch = vehicleRaw.match(/(20\d{2}|19\d{2})/);
  const year = yearMatch ? yearMatch[1] : "";
  const MODELS = ["Golf R","GTI","GLI","Tiguan","Atlas Cross Sport","Atlas","Taos","Jetta","Arteon","ID.4","ID.Buzz"];
  let model = "";
  for (const m of MODELS) { if (vehicleRaw.toLowerCase().includes(m.toLowerCase())) { model = m; break; } }

  // VIN — first 17-char VIN (the purchased vehicle, not the trade)
  const vinMatch = text.match(/VIN:\s*([A-HJ-NPR-Z0-9]{17})/i);
  const vin = vinMatch ? vinMatch[1] : "";

  // Odometer — Mileage on the purchased vehicle (first occurrence, skip trade mileage)
  const milMatch = text.match(/Mileage:\s*(\d+)/i);
  const currentMiles = milMatch ? milMatch[1] : "";

  // Lease terms
  const term = get(/\bTerm:\s*(\d+)/);
  const myRaw = get(/Total Lease Mileage:\s*(\d[\d,]*)/i);
  const milesYearly = myRaw.replace(/,/g, "");
  const milesTerm = (milesYearly && term)
    ? String(Math.round((parseInt(milesYearly) / 12) * parseInt(term))) : "";

  // Financials
  const monthlyPayment = money(get(/Monthly Payment:\s*\$?([\d,]+\.?\d*)/));
  const downPayment    = money(get(/Down Payment:\s*\$?([\d,]+\.?\d*)/));

  // Trade equity = Total Trade Allowance - Total Trade Payoff
  const allowance = parseFloat(money(get(/Total Trade Allowance:\s*\$?([\d,]+\.?\d*)/))||"0") || 0;
  const payoff    = parseFloat(money(get(/Total Trade Payoff:\s*\$?([\d,]+\.?\d*)/))||"0")    || 0;
  const tradeEquity = allowance > 0 ? String((allowance - payoff).toFixed(2)) : "";

  // Lease end
  const leaseEndRaw = get(/End of Term Date:\s*([\d/]+)/);
  let leaseEnd = "";
  if (leaseEndRaw) {
    try {
      const d = new Date(leaseEndRaw);
      if (!isNaN(d)) leaseEnd = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch { leaseEnd = leaseEndRaw; }
  }

  // Bank
  const bankRaw = get(/Financed Through:\s*([^\n]+)/);
  const BANKS = { "VCIL": "VW Credit", "VW CREDIT": "VW Credit", "ALLY": "Ally", "AFFINITY": "Affinity", "CAL": "Cal", "CASH": "" };
  const bank = BANKS[(bankRaw||"").trim().toUpperCase()] ?? bankRaw;

  const isLease = /Lease Turn-in/i.test(text);
  return { name, year, model, vin, term, milesYearly, milesTerm, currentMiles, monthlyPayment, downPayment, tradeEquity, leaseEnd, bank, isLease };
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

function formatTimeLeft(months, days) {
  if (months < 1) return days <= 0 ? "Today" : `${days}d`;
  return `${months} mo`;
}

function monthsColor(m, dayMode = false) {
  if (dayMode) {
    if (m === 0) return "#2a5298";
    if (m <= 3)  return "#3a6ab0";
    if (m <= 5)  return "#4a7ac0";
    return "#8090a8";
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

// ── SEED DATA ─────────────────────────────────────────────────────────────────

const SEED_CUSTOMERS = [
  {
    id: uid(), name: "Marcus Webb", year: 2022, model: "Tiguan", trim: "SE", bank: "VW Credit",
    term: 36, monthlyPayment: 389, downPayment: 2000, tradeEquity: 1200,
    milesYearly: 12000, milesTerm: 36000, currentMiles: 28400,
    leaseEnd: "Apr 15, 2026", privateIncentive: 1500, incentiveExp: "Mar 31", status: "attempting",
  },
  {
    id: uid(), name: "Priya Nair", year: 2023, model: "Jetta", trim: "SEL", bank: "VW Credit",
    term: 36, monthlyPayment: 299, downPayment: 1500, tradeEquity: 0,
    milesYearly: 10000, milesTerm: 30000, currentMiles: 21900,
    leaseEnd: "May 20, 2026", privateIncentive: 750, incentiveExp: "Apr 15", status: "contact",
  },
  {
    id: uid(), name: "Jordan Ellis", year: 2022, model: "Atlas", trim: "SE Black", bank: "VW Credit",
    term: 36, monthlyPayment: 489, downPayment: 0, tradeEquity: 800,
    milesYearly: 12000, milesTerm: 36000, currentMiles: 34100,
    leaseEnd: "Mar 28, 2026", privateIncentive: 2000, incentiveExp: "Mar 15", status: "early",
  },
  {
    id: uid(), name: "Sofia Reyes", year: 2023, model: "Atlas", trim: "SEL Premium R-Line", bank: "Ally",
    term: 39, monthlyPayment: 612, downPayment: 3500, tradeEquity: 2200,
    milesYearly: 10000, milesTerm: 32500, currentMiles: 18200,
    leaseEnd: "Jul 10, 2026", privateIncentive: 1500, incentiveExp: "Jun 1", status: "waiting",
  },
  {
    id: uid(), name: "Derek Huang", year: 2024, model: "GTI", trim: "SE", bank: "VW Credit",
    term: 36, monthlyPayment: 379, downPayment: 1000, tradeEquity: 0,
    milesYearly: 15000, milesTerm: 45000, currentMiles: 11300,
    leaseEnd: "Mar 5, 2026", privateIncentive: 1750, incentiveExp: "Mar 20", status: "success",
  },
  {
    id: uid(), name: "Aisha Okon", year: 2023, model: "Taos", trim: "SE Tech", bank: "Ally",
    term: 48, monthlyPayment: 329, downPayment: 2000, tradeEquity: 0,
    milesYearly: 10000, milesTerm: 40000, currentMiles: 15600,
    leaseEnd: "Aug 22, 2026", privateIncentive: 0, incentiveExp: "—", status: "lost",
  },
  {
    id: uid(), name: "Luca Ferraro", year: 2022, model: "Cross Sport", trim: "SEL", bank: "VW Credit",
    term: 36, monthlyPayment: 449, downPayment: 2500, tradeEquity: 1800,
    milesYearly: 12000, milesTerm: 36000, currentMiles: 26700,
    leaseEnd: "Jun 3, 2026", privateIncentive: 1000, incentiveExp: "May 30", status: "attempting",
  },
  {
    id: uid(), name: "Nina Patel", year: 2024, model: "Golf R", trim: "S", bank: "VW Credit",
    term: 36, monthlyPayment: 522, downPayment: 1500, tradeEquity: 950,
    milesYearly: 12000, milesTerm: 36000, currentMiles: 8900,
    leaseEnd: "Apr 30, 2026", privateIncentive: 1250, incentiveExp: "Apr 1", status: "contact",
  },
  {
    id: uid(), name: "Omar Hassan", year: 2023, model: "GLI", trim: "SE Black", bank: "Affinity",
    term: 36, monthlyPayment: 349, downPayment: 0, tradeEquity: 0,
    milesYearly: 10000, milesTerm: 30000, currentMiles: 12100,
    leaseEnd: "Sep 14, 2026", privateIncentive: 0, incentiveExp: "—", status: "early",
  },
  {
    id: uid(), name: "Claire Dubois", year: 2022, model: "Tiguan", trim: "SEL Premium R-Line", bank: "VW Credit",
    term: 39, monthlyPayment: 459, downPayment: 3000, tradeEquity: 1600,
    milesYearly: 12000, milesTerm: 39000, currentMiles: 29800,
    leaseEnd: "May 8, 2026", privateIncentive: 1000, incentiveExp: "Apr 30", status: "waiting",
  },
];

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
  body { font-family: 'Inter', sans-serif; height: 100vh; overflow: hidden; background: #0c0c0e; }
  body:has(.app.day) { background: #ffffff; }

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

  /* ── LIGHT THEME (clean white) ── */
  .app.day {
    --bg-body:        #ffffff;
    --bg-sidebar:     #ffffff;
    --bg-panel:       #ffffff;
    --bg-card:        #ffffff;
    --bg-input:       #f5f6f8;
    --bg-input-meta:  #eef0f3;
    --bg-hover:       #f0f2f5;
    --bg-hover-sm:    #e0e4ec;
    --bg-hover-cell:  #f5f6f8;
    --bg-confirm:     #ffffff;
    --bg-row-selected: #e8f0ff;
    --bg-status-opt-hover: #f0f2f5;
    --border-main:    #e8eaee;
    --border-sidebar: #eceef2;
    --border-input:   #d8dce4;
    --border-input-focus: #3d7ed4;
    --border-card:    #e4e6ea;
    --border-confirm: #e4e6ea;
    --border-status:  #d8dce4;
    --text-primary:   #111318;
    --text-secondary: #4a5060;
    --text-tertiary:  #7a8494;
    --text-muted:     #9aa0ae;
    --text-dimmer:    #b8bec8;
    --text-cell:      #1e2330;
    --text-name:      #111318;
    --text-nav:       #5c6370;
    --text-nav-count: #6c7280;
    --text-section:   #9aa0ae;
    --scrollbar:      #d4d8e0;
    --shadow-panel:   rgba(0,0,0,0.06);
    --shadow-modal:   rgba(0,0,0,0.12);
    --overlay-bg:     rgba(0,0,0,0.3);
    --overlay-bg2:    rgba(0,0,0,0.4);
    --btn-primary-bg:   #2a5298;
    --btn-primary-hover: #1e4285;
    --btn-primary-text:  #eef3fc;
  }

  @keyframes fadeIn      { from { opacity: 0; } to { opacity: 1; } }
  @keyframes modalIn     { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
  @keyframes statusFlash { 0% { opacity: 1; } 30% { opacity: 0.4; transform: scale(0.94); } 100% { opacity: 1; transform: scale(1); } }
  @keyframes modalOut    { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.97); } }
  @keyframes panelIn     { from { opacity: 0; transform: translateX(16px) scale(0.99); } to { opacity: 1; transform: translateX(0) scale(1); } }
  @keyframes panelOut    { from { opacity: 1; transform: translateX(0) scale(1); } to { opacity: 0; transform: translateX(16px) scale(0.99); } }
  @keyframes panelContentIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

  .sidebar { width: 220px; min-width: 220px; background: var(--bg-sidebar); display: flex; flex-direction: column; transition: width 0.2s cubic-bezier(0.16,1,0.3,1), min-width 0.2s cubic-bezier(0.16,1,0.3,1); overflow: hidden; }
  .sidebar.collapsed { width: 52px; min-width: 52px; }
  .sidebar-header { padding: 10px 10px 10px 14px; display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
  .profile-btn { display: flex; align-items: center; gap: 9px; cursor: pointer; user-select: none; padding: 4px 6px; border-radius: 7px; transition: background 0.1s; flex: 1; min-width: 0; overflow: hidden; }
  .profile-btn:hover { background: var(--bg-hover-sm); }
  .sidebar-collapse-btn { display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 5px; border: none; background: transparent; color: var(--text-secondary); cursor: pointer; flex-shrink: 0; transition: background 0.1s, color 0.1s; }
  .sidebar-collapse-btn:hover { background: var(--bg-hover-sm); color: var(--text-primary); }
  /* Collapsed state — hide text labels */
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
  .profile-avatar { width: 28px; height: 28px; background: linear-gradient(135deg, #1a3a6e, #2a5090); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: #fff; letter-spacing: 0.3px; flex-shrink: 0; }
  .app.day .profile-avatar { background: linear-gradient(135deg, #3d7ed4, #60a5fa); }
  .profile-name { font-size: 12.5px; font-weight: 500; color: var(--text-primary); letter-spacing: -0.1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sidebar-body { flex: 1; padding: 12px 8px; display: flex; flex-direction: column; gap: 2px; }
  .sidebar-section-label { font-size: 10px; color: var(--text-section); letter-spacing: 0.5px; text-transform: uppercase; padding: 0 8px; margin-bottom: 4px; font-weight: 600; }
  .nav-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 5px; cursor: pointer; font-size: 12.5px; color: var(--text-nav); font-weight: 400; transition: background 0.08s, color 0.08s; user-select: none; }
  .nav-item:hover  { background: var(--border-sidebar); color: var(--text-cell); }
  .nav-item.active { background: var(--bg-hover); color: var(--text-primary); font-weight: 500; }
  .nav-icon { display: flex; align-items: center; justify-content: center; opacity: 0.55; width: 16px; flex-shrink: 0; }
  .nav-count { margin-left: auto; font-size: 10.5px; color: var(--text-nav-count); background: var(--bg-hover-sm); border-radius: 4px; padding: 1px 6px; font-weight: 500; }
  .sidebar-footer { padding: 10px 8px; display: flex; align-items: center; justify-content: space-between; }
  .theme-toggle { display: flex; align-items: center; gap: 6px; padding: 4px 6px; cursor: pointer; border-radius: 5px; transition: background 0.1s; flex-shrink: 0; }
  .theme-icon { transition: transform 0.4s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s; }
  .theme-icon.spinning { transform: rotate(180deg); }
  .theme-toggle:hover { background: var(--bg-hover-sm); }
  .toggle-track { width: 28px; height: 16px; border-radius: 20px; background: var(--border-input); border: 1px solid var(--border-status); transition: background 0.2s, border-color 0.2s; flex-shrink: 0; position: relative; }
  .toggle-track.on { background: #1e2a3a; border-color: #2a3a4a; }
  .app.day .toggle-track.on { background: #dbeafe; border-color: #93c5fd; }
  .app.day .toggle-track.on .toggle-thumb { background: #3d7ed4; }
  .toggle-thumb { position: absolute; top: 2px; left: 2px; width: 10px; height: 10px; border-radius: 50%; background: var(--text-secondary); transition: transform 0.2s cubic-bezier(0.16,1,0.3,1), background 0.2s; }
  .toggle-track.on .toggle-thumb { transform: translateX(12px); background: #fff; }

  .main-wrapper { flex: 1; display: flex; align-items: stretch; padding: 10px 10px 10px 0; overflow: hidden; }
  .list-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-panel); border-radius: 10px; border: 1px solid var(--border-card); box-shadow: 0 0 0 1px var(--shadow-panel), 0 8px 32px var(--shadow-panel); }

  .topbar { display: flex; align-items: center; gap: 10px; padding: 0 18px; height: 46px; border-bottom: 1px solid var(--border-main); flex-shrink: 0; border-radius: 10px 10px 0 0; }
  .topbar-title { font-size: 13px; font-weight: 600; color: var(--text-primary); letter-spacing: -0.1px; }
  .spacer { flex: 1; }
  .search-box { background: var(--bg-input); border: 1px solid var(--border-input); border-radius: 6px; padding: 0 10px; height: 28px; font-size: 12px; font-family: 'Inter', sans-serif; color: var(--text-cell); width: 160px; outline: none; transition: border-color 0.2s, width 0.25s cubic-bezier(0.16,1,0.3,1); }
  .search-box:focus { border-color: var(--border-input-focus); color: var(--text-primary); width: 240px; }
  .search-box::placeholder { color: var(--text-secondary); }
  .btn-primary { display: flex; align-items: center; gap: 6px; background: var(--btn-primary-bg); color: var(--btn-primary-text); border: none; border-radius: 7px; padding: 0 12px; height: 28px; font-size: 12px; font-family: 'Inter', sans-serif; font-weight: 500; cursor: pointer; transition: background 0.15s; white-space: nowrap; letter-spacing: -0.1px; }
  .btn-primary:hover { background: var(--btn-primary-hover); }
  .btn-secondary { display: flex; align-items: center; gap: 6px; background: transparent; color: var(--text-secondary); border: 1px solid var(--border-input); border-radius: 7px; padding: 0 12px; height: 28px; font-size: 12px; font-family: 'Inter', sans-serif; font-weight: 500; cursor: pointer; transition: background 0.1s, color 0.1s; white-space: nowrap; }
  .btn-secondary:hover { background: var(--bg-hover); color: var(--text-primary); border-color: var(--border-status); }
  .btn-secondary { padding: 6px 14px; border-radius: 6px; background: transparent; border: 1px solid var(--border-confirm); font-size: 12.5px; font-family: 'Inter', sans-serif; color: var(--text-tertiary); cursor: pointer; font-weight: 500; transition: all 0.1s; }
  .btn-secondary:hover { background: var(--bg-hover); color: var(--text-cell); }

  .stats-bar { display: flex; border-bottom: 1px solid var(--border-main); flex-shrink: 0; }
  .stat-item { flex: 1; padding: 11px 18px; border-right: 1px solid var(--border-main); display: flex; flex-direction: column; gap: 3px; }
  .stat-item:last-child { border-right: none; }
  .stat-value { font-size: 26px; font-weight: 600; color: var(--text-primary); letter-spacing: -0.6px; }
  .stat-label { font-size: 9.5px; color: var(--text-secondary); letter-spacing: 0.4px; text-transform: uppercase; font-weight: 500; }

  .table-wrap { flex: 1; overflow-y: auto; overflow-x: auto; }
  .table-wrap::-webkit-scrollbar { width: 4px; height: 4px; }
  .table-wrap::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 3px; }
  .col-headers { display: grid; grid-template-columns: ${GRID}; padding: 0 14px; height: 30px; align-items: center; border-bottom: 1px solid var(--border-main); position: sticky; top: 0; background: var(--bg-panel); z-index: 10; min-width: 0; }
  .col-header { font-size: 9.5px; color: var(--text-secondary); font-weight: 500; letter-spacing: 0.4px; text-transform: uppercase; display: flex; align-items: center; gap: 4px; cursor: pointer; user-select: none; transition: color 0.1s; height: 100%; }
  .col-header:hover  { color: var(--text-secondary); }
  .col-header.active { color: #7aa4e0; }
  .app.day .col-header.active { color: #3a6ab0; }
  .sort-icon { display: flex; align-items: center; opacity: 0.5; flex-shrink: 0; }
  .col-header.active .sort-icon { opacity: 1; }

  .customer-row { display: grid; grid-template-columns: ${GRID}; padding: 0 14px; height: 46px; align-items: center; border-bottom: 1px solid var(--border-sidebar); cursor: pointer; transition: background 0.08s; user-select: none; }
  .density-compact .customer-row { height: 34px; }

  .density-btn { display: flex; align-items: center; gap: 5px; padding: 0 8px; height: 28px; border-radius: 5px; border: 1px solid var(--border-input); background: transparent; font-size: 12px; font-family: "Inter", sans-serif; color: var(--text-secondary); cursor: pointer; transition: background 0.1s, color 0.1s; }
  .density-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
  .density-menu { position: absolute; top: calc(100% + 6px); right: 0; background: var(--bg-card); border: 1px solid var(--border-card); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.3); z-index: 50; overflow: hidden; min-width: 130px; animation: modalIn 0.12s cubic-bezier(0.16,1,0.3,1); }
  .density-option { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; font-size: 12px; font-family: "Inter", sans-serif; color: var(--text-cell); cursor: pointer; transition: background 0.08s; }
  .density-option:hover { background: var(--bg-hover); }
  .density-option.active { color: var(--text-primary); font-weight: 500; }
  .customer-row:hover { background: var(--bg-hover); }
  .customer-row:hover .row-actions { opacity: 1; pointer-events: all; }
  .customer-row.selected { background: var(--bg-row-selected); }
  .customer-row.urgent   { background: var(--bg-row-urgent); }
  .customer-row.urgent:hover { background: var(--bg-row-urgent-hover); }
  .row-actions { position: absolute; right: 0; top: 50%; transform: translateY(-50%); display: flex; align-items: center; gap: 4px; opacity: 0; pointer-events: none; transition: opacity 0.12s; z-index: 5; }
  .row-action-btn { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 5px; border: 1px solid var(--border-input); background: var(--bg-panel); cursor: pointer; color: var(--text-secondary); transition: all 0.1s; }
  .row-action-btn:hover { background: var(--bg-hover); border-color: var(--border-status); color: var(--text-cell); }
  .row-action-btn.danger:hover { background: #221414; border-color: #3a1a1a; color: #a83838; }
  .app.day .row-action-btn.danger:hover { background: #fee2e2; border-color: #fca5a5; color: #b91c1c; }

  .cell-name    { font-size: 13px; color: var(--text-name); font-weight: 500; letter-spacing: -0.1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px; }
  .notes-count-badge { font-size: 9.5px; font-weight: 500; background: var(--border-main); color: var(--text-secondary); border-radius: 10px; padding: 1px 6px; flex-shrink: 0; letter-spacing: 0; }
  .cell-year    { font-size: 12px; color: var(--text-cell); font-weight: 400; }
  .cell-model   { font-size: 12.5px; color: var(--text-primary); font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cell-trim    { font-size: 12px; color: var(--text-cell); font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cell-miles   { font-size: 12px; color: var(--text-secondary); }
  .cell-incentive { font-size: 12.5px; font-weight: 500; transition: opacity 0.1s; }
  .cell-incentive.none { opacity: 0.25; }
  .cell-incentive-exp  { font-size: 12px; color: var(--text-cell); display: flex; align-items: center; gap: 5px; }
  .miles-warn-dot { width: 5px; height: 5px; border-radius: 50%; display: inline-block; vertical-align: middle; margin-right: 4px; flex-shrink: 0; }
  .incentive-warn-dot { width: 5px; height: 5px; border-radius: 50%; background: #f59e0b; flex-shrink: 0; box-shadow: 0 0 5px #f59e0b88; display: inline-block; vertical-align: middle; }
  .cell-lease-end      { font-size: 12px; color: var(--text-cell); }
  .months-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 500; }
  .status-pill { display: inline-flex; align-items: center; gap: 5px; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 500; letter-spacing: 0.1px; border: 1px solid transparent; white-space: nowrap; }

  /* Status selector in detail panel */
  .status-selector { padding: 12px 18px 14px; border-bottom: 1px solid var(--border-main); flex-shrink: 0; }
  .status-selector-label { font-size: 9.5px; color: var(--text-secondary); font-weight: 500; letter-spacing: 0.4px; text-transform: uppercase; margin-bottom: 8px; }
  .status-options { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; }
  .status-option { display: flex; align-items: center; justify-content: center; gap: 5px; padding: 4px 6px; border-radius: 6px; font-size: 11px; font-weight: 500; border: 1px solid var(--border-status); background: transparent; cursor: pointer; color: var(--text-secondary); transition: all 0.12s; font-family: 'Inter', sans-serif; white-space: nowrap; }
  .status-option:hover { border-color: var(--border-status); color: var(--text-cell); background: var(--bg-status-opt-hover); }
  .status-option.active { border-color: transparent; color: #0c0c0e; font-weight: 600; }
  .status-option.flashing { animation: statusFlash 0.3s ease; }
  .app.day .status-option.active { color: #ffffff; }
  .status-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

  .empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 40px; }
  .empty-state-icon { opacity: 0.18; margin-bottom: 6px; }
  .empty-state-title { font-size: 13px; font-weight: 500; color: var(--text-tertiary); }
  .empty-state-sub   { font-size: 12px; color: var(--text-muted); }

  .confirm-overlay { position: fixed; inset: 0; background: var(--overlay-bg2); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 200; animation: fadeIn 0.12s ease; }
  .confirm-box { background: var(--bg-confirm); border: 1px solid var(--border-confirm); border-radius: 10px; padding: 20px 22px; width: 320px; box-shadow: 0 24px 64px rgba(0,0,0,0.6); animation: modalIn 0.15s cubic-bezier(0.16, 1, 0.3, 1); }
  .confirm-title { font-size: 13.5px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; }
  .confirm-sub   { font-size: 12px; color: var(--text-secondary); margin-bottom: 18px; line-height: 1.5; }
  .confirm-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .btn-danger { padding: 6px 14px; border-radius: 6px; background: #5a1a1a; border: 1px solid #7a2020; color: #f0a0a0; font-size: 12.5px; font-family: 'Inter', sans-serif; font-weight: 600; cursor: pointer; transition: all 0.1s; }
  .btn-danger:hover { background: #7a2020; }
  .app.day .btn-danger { background: #fee2e2; border-color: #fca5a5; color: #b91c1c; }
  .app.day .btn-danger:hover { background: #fecaca; }

  .detail-backdrop { position: fixed; inset: 0; z-index: 19; background: var(--overlay-bg); backdrop-filter: blur(4px); animation: fadeIn 0.12s ease; }
  .detail-panel { position: absolute; top: 0; right: 0; bottom: 0; width: 55%; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-card); border-radius: 10px; border: 1px solid var(--border-input); box-shadow: -8px 0 40px var(--shadow-panel), 0 0 0 1px var(--shadow-panel); z-index: 20; }
  .detail-panel.enter { animation: panelIn  0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
  .detail-panel.exit  { animation: panelOut 0.18s cubic-bezier(0.4, 0, 1, 1) forwards; }
  .detail-panel.enter .detail-topbar, .detail-panel.enter .status-selector, .detail-panel.enter .detail-meta-grid-wrap, .detail-panel.enter .detail-body { animation: panelContentIn 0.28s cubic-bezier(0.16, 1, 0.3, 1) both; }
  .detail-panel.enter .status-selector { animation-delay: 0.04s; }
  .detail-panel.enter .detail-meta-grid-wrap { animation-delay: 0.07s; }
  .detail-panel.enter .detail-body { animation-delay: 0.1s; }
  .detail-topbar { display: flex; align-items: center; gap: 8px; padding: 16px 18px 14px; border-bottom: 1px solid var(--border-main); flex-shrink: 0; border-radius: 10px 10px 0 0; }
  .detail-lead-name { font-size: 20px; font-weight: 400; color: var(--text-primary); letter-spacing: -0.4px; line-height: 1.2; }
  .detail-close { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 5px; background: transparent; border: none; cursor: pointer; color: var(--text-secondary); transition: background 0.1s, color 0.1s; margin-left: auto; }
  .detail-close:hover { background: var(--bg-hover); color: var(--text-cell); }
  .detail-edit-btn { display: flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 5px; background: transparent; border: 1px solid var(--border-input); cursor: pointer; color: var(--text-secondary); font-size: 11.5px; font-family: 'Inter', sans-serif; font-weight: 500; transition: all 0.1s; }
  .detail-edit-btn:hover  { background: var(--bg-hover); color: var(--text-cell); border-color: var(--border-status); }
  .detail-edit-btn.active { background: var(--bg-row-selected); border-color: #3d7ed4; color: #3d7ed4; }
  .detail-edit-btn.saved { background: transparent; border-color: #2a8f4e; color: #2a8f4e; }
  .app.day .detail-edit-btn.saved { border-color: #16a34a; color: #16a34a; }

  .detail-meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--border-main); border-bottom: 1px solid var(--border-main); flex-shrink: 0; }
  .detail-meta-cell { background: var(--bg-card); padding: 11px 16px; display: flex; flex-direction: column; gap: 3px; }
  .detail-meta-label { font-size: 9.5px; color: var(--text-secondary); font-weight: 500; letter-spacing: 0.3px; text-transform: uppercase; }
  .detail-meta-value { font-size: 12.5px; color: var(--text-primary); font-weight: 400; }
  .detail-meta-value.urgent  { color: #7aa4e0; }
  .app.day .detail-meta-value.urgent  { color: #2a5298; }
  .detail-meta-value.warning { color: #5a84c0; }
  .app.day .detail-meta-value.warning { color: #3a6ab0; }
  .detail-meta-value.caution { color: #4a6ea8; }
  .app.day .detail-meta-value.caution { color: #4a7ac0; }
  .detail-meta-value.blue    { color: #5a84c0; }
  .app.day .detail-meta-value.blue    { color: #3a6ab0; }
  .detail-meta-value.dim     { color: var(--text-muted); }
  .meta-input { background: var(--bg-input-meta); border: 1px solid var(--border-status); border-radius: 5px; padding: 4px 8px; font-size: 12.5px; font-family: 'Inter', sans-serif; color: var(--text-primary); outline: none; width: 100%; transition: border-color 0.15s; box-sizing: border-box; appearance: none; }
  .meta-input:focus { border-color: #3d7ed4; }
  .meta-input::placeholder { color: var(--text-muted); }

  .detail-body { flex: 1; overflow-y: auto; position: relative; }
  .detail-body-inner { padding-bottom: 20px; }
  .detail-scroll-fade { position: sticky; bottom: 0; left: 0; right: 0; height: 32px; background: linear-gradient(to bottom, transparent, var(--bg-card)); pointer-events: none; margin-top: -32px; }
  .detail-body::-webkit-scrollbar { width: 4px; }
  .detail-body::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 3px; }
  .detail-notes { padding: 16px 18px 20px; display: flex; flex-direction: column; gap: 10px; }
  .notes-label { font-size: 9.5px; font-weight: 500; color: var(--text-secondary); letter-spacing: 0.4px; text-transform: uppercase; }
  .notes-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; padding: 10px 16px; border: 1px dashed var(--border-input); border-radius: 7px; cursor: pointer; transition: border-color 0.15s, background 0.15s; min-height: 56px; }
  .notes-empty:hover { border-color: var(--border-status); background: var(--bg-input); }
  .notes-empty-icon { font-size: 16px; opacity: 0.2; }
  .notes-empty-text { font-size: 12px; color: var(--text-muted); }
  .notes-empty-hint { font-size: 10.5px; color: var(--text-dimmer); }
  .notes-textarea { width: 100%; background: var(--bg-input); border: 1px solid var(--border-input); border-radius: 7px; padding: 9px 11px; font-size: 12.5px; font-family: 'Inter', sans-serif; color: var(--text-cell); resize: none; outline: none; transition: border-color 0.15s; line-height: 1.5; min-height: 56px; }  .notes-textarea:focus { border-color: var(--border-input-focus); color: var(--text-primary); }
  .notes-textarea::placeholder { color: var(--text-muted); }
  .notes-footer { display: flex; align-items: center; justify-content: space-between; }
  .notes-saved-at { font-size: 10.5px; color: var(--text-muted); }
  .notes-save-btn { padding: 4px 12px; border-radius: 5px; background: #3d7ed4; color: #fff; border: none; font-size: 11.5px; font-family: 'Inter', sans-serif; font-weight: 600; cursor: pointer; transition: background 0.15s; }
  .notes-save-btn:hover    { background: #4d8ee4; }
  .notes-save-btn:disabled { opacity: 0.35; cursor: not-allowed; }

  .notes-history { display: flex; flex-direction: column; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-main); }
  .note-entry { display: flex; gap: 12px; padding-bottom: 18px; }
  .note-entry:last-child { padding-bottom: 0; }
  .note-timeline-col { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; width: 14px; padding-top: 3px; }
  .note-timeline-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--border-input); border: 1.5px solid var(--border-status); flex-shrink: 0; z-index: 1; }
  .note-entry:first-child .note-timeline-dot { background: #3d7ed4; border-color: #3d7ed4; }
  .note-timeline-line { width: 1px; flex: 1; background: var(--border-main); margin-top: 4px; }
  .note-entry:last-child .note-timeline-line { display: none; }
  .note-entry-body { flex: 1; min-width: 0; }
  .note-entry-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; }
  .note-entry-time { font-size: 10px; color: var(--text-tertiary); font-weight: 600; letter-spacing: 0.4px; text-transform: uppercase; }
  .note-entry-delete { display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 4px; border: none; background: transparent; cursor: pointer; color: var(--text-muted); transition: background 0.1s, color 0.1s; }
  .note-entry-delete:hover { background: #221414; color: #a83838; }
  .app.day .note-entry-delete:hover { background: #fee2e2; color: #b91c1c; }
  .note-entry-text { font-size: 12.5px; color: var(--text-cell); line-height: 1.6; white-space: pre-wrap; }

  .modal-overlay { position: fixed; inset: 0; background: var(--overlay-bg); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); display: flex; align-items: center; justify-content: center; z-index: 100; animation: fadeIn 0.12s ease; }
  .modal { background: var(--bg-panel); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid var(--border-card); border-radius: 14px; width: 480px; overflow: hidden; box-sizing: border-box; box-shadow: 0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04); animation: modalIn 0.15s cubic-bezier(0.16, 1, 0.3, 1); }
  .modal-topbar { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px 14px; }
  .modal-name-input { background: transparent; border: none; outline: none; font-size: 16px; font-weight: 400; color: var(--text-primary); font-family: 'Inter', sans-serif; letter-spacing: -0.2px; flex: 1; min-width: 0; }
  .modal-name-input::placeholder { color: var(--text-primary); font-weight: 400; opacity: 0.6; }
  .modal-subtitle { font-size: 11px; color: var(--text-secondary); letter-spacing: 0.2px; text-transform: uppercase; font-weight: 500; }
  .modal-close { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 5px; background: transparent; border: none; cursor: pointer; color: var(--text-secondary); transition: background 0.1s, color 0.1s; }
  .modal-close:hover { background: var(--bg-hover); color: var(--text-cell); }
  .modal-body { padding: 0 18px 18px; display: flex; flex-direction: column; gap: 14px; box-sizing: border-box; width: 100%; }
  .modal-row { display: grid; gap: 8px; box-sizing: border-box; width: 100%; }
  .modal-row.cols-2 { grid-template-columns: 1fr 1fr; }
  .modal-row.cols-3 { grid-template-columns: 1fr 1fr 1fr; }
  .modal-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .modal-field label { font-size: 9.5px; font-weight: 500; color: var(--text-secondary); letter-spacing: 0.3px; text-transform: uppercase; }
  .modal-field input { background: var(--bg-input); border: 1px solid var(--border-input); border-radius: 6px; padding: 6px 9px; font-size: 12px; font-family: 'Inter', sans-serif; color: var(--text-primary); outline: none; transition: border-color 0.15s; width: 100%; box-sizing: border-box; min-width: 0; }
  .modal-field input:focus { border-color: var(--border-input-focus); }
  .modal-field input::placeholder { color: var(--text-secondary); opacity: 0.5; }
  .modal-field select { background: var(--bg-input); border: 1px solid var(--border-input); border-radius: 6px; padding: 6px 9px; font-size: 12px; font-family: 'Inter', sans-serif; color: var(--text-primary); outline: none; transition: border-color 0.15s; width: 100%; box-sizing: border-box; min-width: 0; cursor: pointer; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236b7a99' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 9px center; padding-right: 26px; }
  .modal-field select:focus { border-color: var(--border-input-focus); }
  .modal-field select option { background: var(--bg-panel); color: var(--text-primary); }
  .modal-divider { height: 1px; background: var(--border-main); }
  .modal-footer { padding: 12px 18px; border-top: 1px solid var(--border-main); display: flex; justify-content: flex-end; gap: 8px; }
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
    if (amount >= 1500) return "#2a5298";
    if (amount >= 1000) return "#3a6ab0";
    return "#8090a8";
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

export default function LeaseTracker() {
  const { user, signOut } = useAuth();
  const [showSettings, setShowSettings] = useState(false);
  const [state,   dispatch] = useReducer(reducer, null, loadState);
  const { customers, notes } = state;
  const [dbLoading, setDbLoading] = useState(true);

  // Panel state — "closed" | "open" | "closing"
  const [panelState,    setPanelState]    = useState("closed");
  const [selected,      setSelected]      = useState(null);
  const [snapCustomer,  setSnapCustomer]  = useState(null);

  const [editMode,  setEditMode]  = useState(false);
  const [editForm,  setEditForm]  = useState({});
  const [editSaved, setEditSaved] = useState(false);

  // Notes — simple: show empty state or textarea
  const [noteDraft, setNoteDraft] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const notesRef = useRef(null);

  const [search,    setSearch]    = useState("");
  const [sortKey,   setSortKey]   = useState(() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY + "-prefs") || "{}").sortKey || null; } catch { return null; } });
  const [sortDir,   setSortDir]   = useState(() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY + "-prefs") || "{}").sortDir || "asc"; } catch { return "asc"; } });

  const [showModal, setShowModal] = useState(false);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [modalTab,    setModalTab]    = useState("manual");
  const [importText,  setImportText]  = useState("");
  const [importError, setImportError] = useState("");

  const [confirmDel, setConfirmDel] = useState(null);
  const [isDayMode,  setIsDayMode]  = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [density, setDensity] = useState("comfortable"); // compact | comfortable
  const [flashingStatus, setFlashingStatus] = useState(null);
  const [themeAnimating, setThemeAnimating] = useState(false);
  const [densityOpen, setDensityOpen] = useState(false);
  const densityRef = useRef(null);
  const [statFilter, setStatFilter]  = useState(() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY + "-prefs") || "{}").statFilter || null; } catch { return null; } });

  const toggleTheme = useCallback(() => {
    setThemeAnimating(true);
    setIsDayMode(v => !v);
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

  const openPanel = useCallback((id) => {
    const c = customers.find(x => x.id === id);
    if (!c) return;
    clearTimeout(closeTimer.current);
    setSelected(id);
    setSnapCustomer(c);
    setNoteDraft("");
    setNotesOpen(false);
    setEditMode(false);
    setEditSaved(false);
    setPanelState("open");
  }, [customers]);

  const closePanel = useCallback(() => {
    clearTimeout(closeTimer.current);
    setEditMode(false);
    setPanelState("closing");
    closeTimer.current = setTimeout(() => {
      setPanelState("closed");
      setSelected(null);
      setNoteDraft("");
      setNotesOpen(false);
    }, 200);
  }, []);

  const handleRowClick = useCallback((id) => {
    if (id === selected && panelState === "open") return;
    openPanel(id);
  }, [selected, panelState, openPanel]);

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
    setTimeout(() => setNoteSaved(false), 2000);
  }, [selected, noteDraft, user]);

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
    });
    setEditMode(true);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!selected) return;
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
    };
    // Write to Supabase
    await supabase.from("customers").update({
      name:             updates.name,
      year:             updates.year,
      model:            updates.model === "—" ? null : updates.model,
      trim:             updates.trim  === "—" ? null : updates.trim,
      bank:             updates.bank  === "—" ? null : updates.bank,
      term:             updates.term,
      miles_yearly:     updates.milesYearly,
      miles_term:       updates.milesTerm,
      current_miles:    updates.currentMiles,
      monthly_payment:  updates.monthlyPayment,
      down_payment:     updates.downPayment,
      trade_equity:     updates.tradeEquity,
      lease_end:        updates.leaseEnd === "—" ? null : updates.leaseEnd,
      private_incentive: updates.privateIncentive,
      incentive_exp:    updates.incentiveExp === "—" ? null : updates.incentiveExp,
      updated_at:       new Date().toISOString(),
    }).eq("id", selected);
    dispatch({ type: "UPDATE_CUSTOMER", id: selected, updates });
    setEditMode(false);
    setEditSaved(true);
    setTimeout(() => setEditSaved(false), 2000);
  }, [selected, editForm, snapCustomer]);

  // ── Add modal ──

  const openModal  = () => { setForm(EMPTY_FORM); setShowModal(true); setModalTab("manual"); setImportText(""); setImportError(""); };
  const closeModal = () => { setShowModal(false); setForm(EMPTY_FORM); setModalTab("manual"); setImportText(""); setImportError(""); };

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
      name:             parsed.name,
      year:             parsed.year,
      model:            parsed.model,
      trim:             "",
      bank:             parsed.bank,
      term:             parsed.term,
      milesYearly:      milesYearlyFormatted,
      milesTerm:        parsed.milesTerm ? Number(parsed.milesTerm).toLocaleString() : "",
      currentMiles:     parsed.currentMiles,
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
      status:           customer.status,
    });
    if (!error) {
      dispatch({ type: "ADD_CUSTOMER", customer });
      closeModal();
      closePanel();
      setTimeout(() => openPanel(customer.id), 50);
    }
  };

  // ── Delete ──

  const confirmDelete = (id, e) => { e.stopPropagation(); setConfirmDel(id); };
  const executeDelete = async () => {
    if (confirmDel === selected) closePanel();
    await supabase.from("customers").delete().eq("id", confirmDel);
    dispatch({ type: "DELETE_CUSTOMER", id: confirmDel });
    setConfirmDel(null);
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
        if (!c.name.toLowerCase().includes(q) && !c.model.toLowerCase().includes(q)) return false;
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

  // ── Render ──

  if (dbLoading) return (
    <div style={{ minHeight:"100vh", background:"#0e1117", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ width:28, height:28, border:"2px solid #1e2432", borderTopColor:"#4a8fd4", borderRadius:"50%", animation:"spin 0.7s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <>
      <style>{css}</style>
      <div className={`app${isDayMode ? " day" : ""}`}>

        {/* SIDEBAR */}
        <aside className={`sidebar${sidebarCollapsed ? " collapsed" : ""}`}>

          {/* Header — avatar + name + collapse arrow when expanded */}
          <div className="sidebar-header">
            <div className="profile-btn" onClick={() => setShowSettings(true)} title="Account settings">
              <div className="profile-avatar">{user ? user.name.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2) : "?"}</div>
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
            <div className="nav-item active">
              <span className="nav-icon"><Layers size={14} strokeWidth={1.75} /></span>
              <span className="nav-item-label">Maturities</span>
              <span className="nav-count">{customers.length}</span>
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
          <div className="list-panel">

            <div className="topbar">
              <span className="topbar-title">Lease Maturities</span>
              <div className="spacer" />
              <input className="search-box" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
              <div style={{ position: "relative" }} ref={densityRef}>
                <button className="density-btn" onClick={() => setDensityOpen(v => !v)}>
                  <AlignJustify size={12} strokeWidth={2} />
                  {density.charAt(0).toUpperCase() + density.slice(1)}
                </button>
                {densityOpen && (
                  <div className="density-menu">
                    {["compact","comfortable"].map(d => (
                      <div key={d} className={`density-option ${density === d ? "active" : ""}`} onClick={() => { setDensity(d); setDensityOpen(false); }}>
                        {d.charAt(0).toUpperCase() + d.slice(1)}
                        {density === d && <Check size={11} strokeWidth={2.5} />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button className="btn-primary" onClick={openModal}><UserPlus size={13} strokeWidth={2} />New Customer</button>
            </div>

            <div className="stats-bar">
              {[
                { value: customers.length, label: "Total",           color: null,       filter: null        },
                { value: urgentCount,      label: "Ending This Mo.", color: isDayMode ? "#2a5298" : "#7aa4e0", filter: 'urgent'    },
                { value: soonCount,        label: "Ending in 3 Mo.", color: isDayMode ? "#3a6ab0" : "#5a84c0", filter: 'soon'      },
                { value: withIncentive,    label: "With Incentive",  color: isDayMode ? "#4a7ac0" : "#4a6ea8", filter: 'incentive' },
                { value: milesAtRisk,       label: "Miles At Risk",    color: isDayMode ? "#b45309" : "#f59e0b", filter: 'miles'     },
              ].map(({ value, label, color, filter }) => {
                const active = statFilter === filter;
                return (
                  <div className="stat-item" key={label}
                    onClick={() => setStatFilter(active ? null : filter)}
                    style={{ cursor: filter ? "pointer" : "default", opacity: statFilter && !active ? 0.45 : 1, transition: "opacity 0.15s" }}>
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
                  <span className="empty-state-sub">{search ? `No results for "${search}"` : statFilter === "urgent" ? "No leases ending this month" : statFilter === "soon" ? "No leases ending in 3 months" : statFilter === "incentive" ? "No customers with active incentives" : "Add a customer to get started"}</span>
                </div>
              ) : filtered.map(row => {
                const monthsLeft         = calcMonthsLeft(row.leaseEnd);
                const incentiveMonthsLeft = calcMonthsLeft(row.incentiveExp);
                const mc     = monthsColor(monthsLeft, isDayMode);
                const imc    = monthsColor(incentiveMonthsLeft, isDayMode);
                const lDays  = monthsLeft === 0 ? calcDaysLeft(row.leaseEnd) : 0;
                const iDays  = incentiveMonthsLeft === 0 ? calcDaysLeft(row.incentiveExp) : 0;
                const lLabel = formatTimeLeft(monthsLeft, lDays);
                const iLabel = formatTimeLeft(incentiveMonthsLeft, iDays);
                const urgent = monthsLeft === 0;

                return (
                  <div
                    key={row.id}
                    className={`customer-row ${selected === row.id ? "selected" : ""}`}
                    onClick={() => handleRowClick(row.id)}
                  >
                    <span className="cell-name">
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</span>
                      {notes[row.id]?.history?.length > 0 && (
                        <span className="notes-count-badge">{notes[row.id].history.length}</span>
                      )}
                      {(() => {
                        const mp = calcMileagePace(row);
                        if (!mp || mp.status === "ok") return null;
                        const color = mp.status === "over" ? "#f87171" : "#f59e0b";
                        const tip = mp.status === "over"
                          ? `Over allowance by ~${Math.abs(mp.overage).toLocaleString()} mi`
                          : `On pace to exceed by ~${mp.overage.toLocaleString()} mi`;
                        return <span className="miles-warn-dot" style={{ background: color, boxShadow: `0 0 5px ${color}88` }} title={tip} />;
                      })()}
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
                      return (
                        <span className="status-pill" style={{ background: sm.color + "22", borderColor: sm.color + "55", color: sm.color }}>
                          <span className="status-dot" style={{ background: sm.color }} />
                          {sm.label}
                        </span>
                      );
                    })()}
                    <div style={{ position: "relative" }}>
                      <div className="row-actions" onClick={e => e.stopPropagation()}>
                        <button className="row-action-btn" title="Edit"
                          onClick={e => { e.stopPropagation(); openPanel(row.id); setTimeout(() => startEdit(row), 20); }}>
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

          {/* DETAIL PANEL */}
          {panelVisible && c && (
            <>
              <div className="detail-backdrop" onClick={closePanel} />
              <div className={`detail-panel ${panelState === "closing" ? "exit" : "enter"}`}>

                <div className="detail-topbar">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="detail-lead-name">{c.name}</div>
                  </div>
                  {editMode && (
                    <button className="detail-edit-btn" onClick={() => setEditMode(false)}>Cancel</button>
                  )}
                  <button className={`detail-edit-btn ${editMode ? "active" : ""} ${editSaved ? "saved" : ""}`}
                    onClick={() => editMode ? saveEdit() : startEdit(c)}>
                    {editSaved ? <><Check size={11} strokeWidth={2.5} /> Saved</> : editMode ? <><Check size={11} strokeWidth={2.5} /> Save</> : <><Pencil size={11} strokeWidth={2} /> Edit</>}
                  </button>
                  <button className="detail-close" onClick={closePanel}><X size={14} strokeWidth={2} /></button>
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
                          await supabase.from("customers").update({ status: s.key, updated_at: new Date().toISOString() }).eq("id", selected);
                          dispatch({ type: "SET_STATUS", id: selected, status: s.key });
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
                    year:            ["2026","2025","2024","2023","2022"],
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
                          { label: "Bank",              val: c.bank || "—",                  key: "bank",           cls: "" },
                          { label: "Term",              val: c.term ? `${c.term} mo` : "—",  key: "term",           cls: "" },
                          { label: "Lease End",         val: c.leaseEnd,                     key: "leaseEnd",       cls: "" },
                          { label: "Mo. Remaining",     val: (() => { const m = calcMonthsLeft(c.leaseEnd); const d = m < 1 ? calcDaysLeft(c.leaseEnd) : 0; return formatTimeLeft(m, d); })(), key: null, cls: moClass },
                          { label: "Monthly Payment",   val: fmt$(c.monthlyPayment),          key: "monthlyPayment", cls: c.monthlyPayment > 0 ? "blue" : "dim" },
                          { label: "Down Payment",      val: fmt$(c.downPayment),             key: "downPayment",    cls: c.downPayment  > 0 ? "blue" : "dim" },
                          { label: "Trade Equity",      val: fmt$(c.tradeEquity),             key: "tradeEquity",    cls: c.tradeEquity  > 0 ? "blue" : "dim" },
                          { label: "Incentive Value",   val: c.privateIncentive > 0 ? `$${c.privateIncentive.toLocaleString()}` : "—", key: "privateIncentive", cls: c.privateIncentive > 0 ? "blue" : "dim" },
                          { label: "Incentive Expires", val: c.incentiveExp,                  key: "incentiveExp",   cls: "" },
                          { label: "Inc. Mo. Left",     val: (() => {
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
                          { label: "Last Modified",      val: c.updatedAt ? new Date(c.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—", key: null, cls: "dim" },
                        ].map(cell)}
                      </div>
                      </div>
                    </>
                  );
                })()}

                <div className="detail-body">
                  <div className="detail-body-inner">
                  <div className="detail-notes">
                    <span className="notes-label">Notes</span>

                    {/* Compose area */}
                    {!notesOpen && !(notes[selected]?.history?.length) ? (
                      <div className="notes-empty" onClick={openNotes}>
                        <span className="notes-empty-icon">✎</span>
                        <span className="notes-empty-text">No notes yet</span>
                        <span className="notes-empty-hint">Click to add your first note</span>
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
                          <span className="notes-saved-at" style={{ color: noteSaved ? (isDayMode ? "#16a34a" : "#2a8f4e") : undefined }}>
                            {noteSaved ? "✓ Saved" : "⌘ + Enter to save"}
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
        </div>

        {/* ADD CUSTOMER MODAL */}
        {showModal && (
          <div className="modal-overlay" onClick={closeModal}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-topbar">
                <div style={{ display:"flex", alignItems:"center", gap:0, background:"var(--bg-input,#1c2130)", borderRadius:7, padding:2, border:"1px solid var(--border-subtle,#252d3e)" }}>
                  {[["manual","✏ Manual"],["import","⬆ Import DMS"]].map(([tab, label]) => (
                    <button key={tab} onClick={() => { setModalTab(tab); setImportError(""); }}
                      style={{ padding:"4px 12px", borderRadius:5, border:"none", fontSize:11, fontFamily:"inherit", fontWeight:500, cursor:"pointer", transition:"all 0.12s",
                        background: modalTab === tab ? (isDayMode ? "#2a4a7a" : "#2a4a7a") : "transparent",
                        color: modalTab === tab ? "#c8daf4" : "var(--text-secondary)" }}>
                      {label}
                    </button>
                  ))}
                </div>
                <button className="modal-close" onClick={closeModal}><X size={14} strokeWidth={2} /></button>
              </div>
              {/* ── Import tab ── */}
              {modalTab === "import" && (
                <div className="modal-body" style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  <p style={{ fontSize:12, color:"var(--text-secondary)", lineHeight:1.6 }}>
                    Open your customer's purchase info page in your DMS, press <strong style={{color:"var(--text-primary)"}}>Cmd+A</strong> then <strong style={{color:"var(--text-primary)"}}>Cmd+C</strong> to copy everything, then paste below.
                  </p>
                  <textarea
                    autoFocus
                    placeholder="Paste DMS text here..."
                    value={importText}
                    onChange={e => { setImportText(e.target.value); setImportError(""); }}
                    style={{ width:"100%", height:180, background:"var(--bg-input,#1c2130)", border:"1px solid var(--border-subtle,#252d3e)", borderRadius:7, padding:"10px 12px", fontSize:12, fontFamily:"inherit", color:"var(--text-primary)", resize:"none", outline:"none", lineHeight:1.5 }}
                  />
                  {importError && (
                    <div style={{ fontSize:11.5, color:"#f0a0a0", background:"#1a0e0e", border:"1px solid #3a1a1a", borderRadius:6, padding:"8px 12px", lineHeight:1.5 }}>
                      ⚠ {importError}
                    </div>
                  )}
                  <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
                    <button className="btn-secondary" onClick={closeModal}>Cancel</button>
                    <button className="btn-primary" onClick={handleParse} disabled={!importText.trim()}>
                      Parse & Fill Form
                    </button>
                  </div>
                </div>
              )}

              {/* ── Manual tab ── */}
              {modalTab === "manual" && <div className="modal-body">
                {/* Row 1 — Vehicle */}
                <div className="modal-row cols-3">
                  <div className="modal-field">
                    <label>Year</label>
                    <select value={form.year ?? ""} onChange={e => setForm(p => ({ ...p, year: e.target.value }))}>
                      <option value="">—</option>
                      {["2026","2025","2024","2023","2022"].map(y => <option key={y} value={y}>{y}</option>)}
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
              </div>}
              {modalTab === "manual" && <div className="modal-footer">
                {isDuplicate && (
                  <span style={{ fontSize: 11, color: isDayMode ? "#b45309" : "#f59e0b", flex: 1, display: "flex", alignItems: "center", gap: 5 }}>
                    ⚠ A customer named "{form.name.trim()}" already exists
                  </span>
                )}
                <button className="btn-secondary" onClick={closeModal}>Cancel</button>
                <button className="btn-primary" onClick={handleAdd}>Add Customer</button>
              </div>}
            </div>
          </div>
        )}

        {/* SETTINGS MODAL */}
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

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
    </>
  );
}
