const INCOMPATIBLE_PAIRS = [
  ['acid', 'base'],
  ['oxidizer', 'reducer'],
];

const CLASS_LABELS = {
  acid: '酸性',
  base: '碱性',
  organic: '有机',
  inorganic: '无机',
  metal: '重金属',
  oxidizer: '氧化性',
  reducer: '还原性',
};

const HAZARD_PROPS = [
  { code: 'flammable', label: '易燃', symbol: '🔥' },
  { code: 'corrosive', label: '腐蚀性', symbol: '🧪' },
  { code: 'toxic', label: '有毒', symbol: '☠️' },
  { code: 'oxidizing', label: '氧化性', symbol: '⚡' },
  { code: 'explosive', label: '爆炸性', symbol: '💥' },
  { code: 'environmental', label: '环境危害', symbol: '🌍' },
  { code: 'irritant', label: '刺激性', symbol: '👁️' },
  { code: 'carcinogen', label: '致癌物', symbol: '⚠️' },
];

const HAZARD_LABELS = {};
const HAZARD_SYMBOLS = {};
for (const h of HAZARD_PROPS) {
  HAZARD_LABELS[h.code] = h.label;
  HAZARD_SYMBOLS[h.code] = h.symbol;
}
const VALID_HAZARD_CODES = new Set(HAZARD_PROPS.map((h) => h.code));

const DIFF_THRESHOLD_PERCENT = 20;

const incompatibleKeys = new Set(
  INCOMPATIBLE_PAIRS.map(([a, b]) => `${a}__${b}`)
);

function isIncompatible(a, b) {
  if (!a || !b || a === b) return false;
  return incompatibleKeys.has(`${a}__${b}`) || incompatibleKeys.has(`${b}__${a}`);
}

function compatibleWithAll(newClass, existingClasses) {
  for (const cls of existingClasses) {
    if (isIncompatible(newClass, cls)) {
      return { ok: false, conflict: cls };
    }
  }
  return { ok: true };
}

function validateHazardProps(raw) {
  if (!raw) return { ok: false, msg: '请选择危险特性' };
  let arr;
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === 'string') arr = raw.split(',').map((s) => s.trim()).filter(Boolean);
  else return { ok: false, msg: '危险特性格式错误' };
  if (arr.length === 0) return { ok: false, msg: '请至少选择一项危险特性' };
  for (const c of arr) {
    if (!VALID_HAZARD_CODES.has(c)) {
      return { ok: false, msg: `未知的危险特性：${c}` };
    }
  }
  return { ok: true, list: arr };
}

function hazardList(raw) {
  if (!raw) return [];
  let arr;
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === 'string') arr = raw.split(',').map((s) => s.trim()).filter(Boolean);
  else return [];
  return arr.map((c) => ({
    code: c,
    label: HAZARD_LABELS[c] || c,
    symbol: HAZARD_SYMBOLS[c] || '',
  }));
}

function calcDiff(dw, aw) {
  const d = Number(dw) || 0;
  const a = Number(aw) || 0;
  if (d <= 0) return { diff_weight: Math.abs(a), diff_percent: a > 0 ? 100 : 0 };
  const diff_weight = Math.abs(a - d);
  const diff_percent = (diff_weight / d) * 100;
  return { diff_weight, diff_percent, needs_review: diff_percent > DIFF_THRESHOLD_PERCENT };
}

module.exports = {
  INCOMPATIBLE_PAIRS,
  CLASS_LABELS,
  HAZARD_PROPS,
  HAZARD_LABELS,
  HAZARD_SYMBOLS,
  DIFF_THRESHOLD_PERCENT,
  isIncompatible,
  compatibleWithAll,
  validateHazardProps,
  hazardList,
  calcDiff,
};
