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

module.exports = {
  INCOMPATIBLE_PAIRS,
  CLASS_LABELS,
  isIncompatible,
  compatibleWithAll,
};
