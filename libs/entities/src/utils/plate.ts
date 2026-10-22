/**
 * `MH 40 CM-9551` -> `MH40CM9551`. Used at ingest and for the plate filter,
 * so both sides normalize the same way.
 */
export function normalizePlate(
  plate: string | null | undefined,
): string | null {
  if (!plate) {
    return null;
  }
  const normalized = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return normalized || null;
}

/**
 * Display spacing, same rules as the reference dashboard:
 * `MH40CM9551` -> `MH 40 CM 9551`, `22BH1234AA` -> `22 BH 1234 AA`.
 * Anything unrecognized is returned unchanged so OCR oddities stay visible.
 */
export function formatPlate(plate: string | null): string | null {
  const clean = normalizePlate(plate);
  if (!plate || !clean) {
    return plate;
  }

  const bh = /^(\d{2})BH(\d{1,5})([A-Z]{1,2})$/.exec(clean);
  if (bh) {
    return `${bh[1]} BH ${bh[2]} ${bh[3]}`;
  }

  const standard = /^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{1,6})$/.exec(clean);
  if (standard) {
    return standard.slice(1).join(' ');
  }

  const noSeries = /^([A-Z]{2})(\d{1,5})$/.exec(clean);
  if (noSeries) {
    return `${noSeries[1]} ${noSeries[2]}`;
  }

  return plate;
}
