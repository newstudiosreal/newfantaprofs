/** Valore di cella CSV: virgolette raddoppiate e apici se serve; neutralizza le formule di Excel (=, +, -, @). */
export function csvCell(v: unknown, sep = ';'): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+@]/.test(s) || (/^-/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s))) s = `'${s}`;
  if (s.includes(sep) || /["\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** CSV per l'Italia: separatore ';', fine riga CRLF e BOM UTF-8 così Excel legge gli accenti. */
export function toCsv(header: string[], data: unknown[][], sep = ';'): string {
  const lines = [header, ...data].map(r => r.map(c => csvCell(c, sep)).join(sep));
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function downloadCsv(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const safeFilename = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'lega';
