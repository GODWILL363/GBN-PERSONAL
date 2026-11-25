// analysis/missing.js — line up the series in the basket on one set of periods, and count what is missing
import { ecoTimeCmp } from "../ui/login";

const isNum = (v) => v != null && v !== "" && isFinite(v);
// "2004" -> "9999", "2004-03" -> "9999-99", "2004Q1" -> "9999Q9": series are only padded when they use the same kind of period
const periodShape = (y) => String(y).trim().replace(/\d/g, "9");

// Give every series an entry (value null) for each period any series in the list has, so gaps are visible and can be imputed.
// Series that are empty, or that use a different kind of period (years next to months), are left as they are.
export const ecoPadSeries = (list) => {
  const arrs = (list || []).map((a) => (Array.isArray(a) ? a : []));
  const shapes = new Set(); arrs.forEach((a) => a.forEach((d) => shapes.add(periodShape(d.year))));
  if (shapes.size !== 1) return arrs;
  const all = [...new Set(arrs.flatMap((a) => a.map((d) => String(d.year))))].sort(ecoTimeCmp);
  if (!all.length) return arrs;
  return arrs.map((a) => {
    if (!a.length) return a;
    const by = new Map(a.map((d) => [String(d.year), d]));
    const numeric = typeof a[0].year === "number";
    return all.map((y) => by.get(y) || { year: numeric && /^\d+$/.test(y) ? +y : y, value: null });
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
