// leo2/core/utils/contextUtils.js

function atomicLine(input) {
  if (!input || typeof input !== 'string') return '';
  return input.split('\n')[0].trim();
}

function enforceAtomicArray(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return '';
  return atomicLine(arr[0]);
}

function assertAtomic(field, fieldName) {
  const lines = field.split('\n');
  if (lines.length > 2 || field.length > 512) {
    console.warn(`[ContextAtomicity] Non-atomic ${fieldName}: truncating.`);
    return lines[0].slice(0, 512).trim();
  }
  return field;
}

module.exports = { atomicLine, enforceAtomicArray, assertAtomic };
