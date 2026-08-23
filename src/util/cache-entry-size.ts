const UTF16_CODE_UNIT_BYTES = 2;
const MIN_ENTRY_COST_BYTES = 1;

/** Estimate retained key and value bytes while keeping every entry charge positive. */
export function estimateRetainedEntrySize(key: string, valueSize: number): number {
  return Math.max(MIN_ENTRY_COST_BYTES, key.length * UTF16_CODE_UNIT_BYTES + valueSize);
}
