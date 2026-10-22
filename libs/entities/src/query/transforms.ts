/**
 * class-transformer helpers for query strings, where every value arrives as
 * a string.
 */

// ?ev=true / ?ev=1 -> true, ?ev=false / ?ev=0 -> false
export const toBoolean = ({ value }: { value: unknown }) => {
  if (value === true || value === 'true' || value === '1') {
    return true;
  }
  if (value === false || value === 'false' || value === '0') {
    return false;
  }
  return value;
};

// ?state=Maharashtra,Gujarat (or repeated ?state=...) -> ['Maharashtra', 'Gujarat']
export const toList = ({ value }: { value: unknown }) => {
  const parts = Array.isArray(value) ? value : [value];
  const list = parts
    .flatMap((part) => (typeof part === 'string' ? part.split(',') : []))
    .map((part) => part.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
};
