import type { Response } from 'express';

export type CsvValue = string | number | boolean | null | undefined;

export function csvCell(value: CsvValue) {
  if (value === null || value === undefined) {
    return '';
  }
  const text = String(value).replace(/"/g, '""');
  return /[",\n\r]/.test(text) ? `"${text}"` : text;
}

export function csvLine(values: CsvValue[]) {
  return values.map(csvCell).join(',') + '\n';
}

/**
 * Sets download headers and writes the BOM (so Excel reads UTF-8) and the
 * header line. Rows are then written with `res.write(csvLine(...))`.
 */
export function startCsv(res: Response, filename: string, headers: string[]) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename}-${Date.now()}.csv"`,
  );
  res.write('﻿' + csvLine(headers));
}
