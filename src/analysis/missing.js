// analysis/missing.js — line up the series in the basket on one set of periods, and count what is missing
import { ecoTimeCmp } from "../ui/login";

const isNum = (v) => v != null && v !== "" && isFinite(v);
// one key per period: 2004, "2004", " 2004 " and "2004.0" are the same year
const normYear = (y) => { const t = String(y ?? "").trim(); return /^\d{4}(\.0+)?$/.test(t) ? parseInt(t, 10) : t; };

// Give every series an entry (value null) for each period any series in the list has, so gaps are visible and can be imputed.
// This is the same set of periods the table shows, so the missing-data notice always agrees with the table. Empty series stay empty.
export const ecoPadSeries = (list) => {
  const arrs = (list || []).map((a) => (Array.isArray(a) ? a.filter((d) => d && d.year != null && String(d.year).trim() !== "").map((d) => ({ ...d, year: normYear(d.year) })) : []));
  const all = [...new Set(arrs.flatMap((a) => a.map((d) => String(d.year))))].sort(ecoTimeCmp);
  if (!all.length) return arrs;
  return arrs.map((a) => {
    if (!a.length) return a;
    const by = new Map(); a.forEach((d) => { const k = String(d.year); const e = by.get(k); if (!e || (e.value == null && d.value != null)) by.set(k, d); });
    return all.map((y) => by.get(y) || { year: normYear(y), value: null });
  });
};

// [{name, missing, total, leading, trailing, inside}] for each series with at least one missing value
// "inside" gaps sit between observed values (interpolation can fill them); leading/trailing ones are before the first or after the last value.
export const ecoMissingReport = (named) =>
  (named || []).map(({ name, data }) => {
    const a = Array.isArray(data) ? data : []; const idx = a.map((d, i) => (isNum(d.value) ? i : -1)).filter((i) => i >= 0);
    const missing = a.length - idx.length; if (!a.length || !missing) return null;
    const first = idx.length ? idx[0] : a.length, last = idx.length ? idx[idx.length - 1] : -1;
    const leading = first, trailing = idx.length ? a.length - 1 - last : 0;
    return { name, missing, total: a.length, leading, trailing, inside: missing - leading - trailing };
  }).filter(Boolean);
