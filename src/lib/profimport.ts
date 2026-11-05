/** Inserimento veloce dei professori: lettura flessibile di righe di testo e controlli. */
export interface ProfRow { key: number; name: string; subject: string; cost: number | null }
export interface ProfDefaults { subject: string; cost: number }

const norm = (s: string) => s.trim().replace(/\s+/g, ' ');
export const nameKey = (s: string) => norm(s).toLowerCase();

/** "12", "12 crediti", "12cr", "12 pt" → 12 (solo interi 1-50). */
function asCost(s: string): number | null {
  const m = /^(\d{1,2})\s*(?:crediti|credito|cr|pt|punti)?$/i.exec(s.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 50 ? n : null;
}

function splitFields(line: string): string[] {
  if (line.includes('\t')) return line.split('\t');
  if (line.includes(';')) return line.split(';');
  if (line.includes('|')) return line.split('|');
  if (/\s[-–—]\s/.test(line)) return line.split(/\s[-–—]\s/);
  if (line.includes(',')) return line.split(',');
  return [line];
}

/**
 * Una riga → un professore. Accetta "Nome; Materia; Costo", "Nome; Costo", "Nome - Materia - 12",
 * "Rossi 12" (numero finale = costo) o solo "Nome" (usa materia e costo predefiniti). L'ordine dei campi è libero:
 * il campo numerico (1-50) è il costo, il primo campo di testo il nome, il secondo la materia.
 */
export function parseProfLine(line: string, d: ProfDefaults, key = 0): ProfRow | null {
  const raw = line.trim();
  if (!raw) return null;
  let fields = splitFields(raw).map(norm).filter(Boolean);
  let cost: number | null = null;
  if (fields.length === 1) {
    const m = /^(.*\S)\s+(\d{1,2})$/.exec(fields[0]);
    if (m && asCost(m[2]) !== null) { fields = [m[1]]; cost = asCost(m[2]); }
  } else {
    for (let i = fields.length - 1; i >= 0; i--) {
      const c = asCost(fields[i]);
      if (c !== null && fields.length > 1) { cost = c; fields.splice(i, 1); break; }
    }
  }
  const [name = '', subject = ''] = fields;
  return { key, name, subject: subject || d.subject, cost: cost ?? d.cost };
}

/** Più righe (incolla da Excel/WhatsApp/appunti). Le righe vuote vengono ignorate. */
export function parseProfText(text: string, d: ProfDefaults, startKey = 0): ProfRow[] {
  const out: ProfRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const r = parseProfLine(line, d, startKey + out.length);
    if (r) out.push(r);
  }
  return out;
}

export interface RowCheck { error: string | null; duplicate: boolean }

/** Errori bloccanti e doppioni (stesso nome già in lega o ripetuto più su nell'elenco). */
export function checkProfRows(rows: ProfRow[], existingNames: string[]): RowCheck[] {
  const seen = new Set(existingNames.map(nameKey));
  return rows.map(r => {
    const k = nameKey(r.name);
    let error: string | null = null;
    if (k.length < 2) error = 'Nome troppo corto';
    else if (norm(r.name).length > 40) error = 'Nome oltre 40 caratteri';
    else if (norm(r.subject).length > 40) error = 'Materia oltre 40 caratteri';
    else if (r.cost === null || !Number.isInteger(r.cost) || r.cost < 1 || r.cost > 50) error = 'Costo da 1 a 50';
    const duplicate = k.length >= 2 && seen.has(k);
    if (k.length >= 2) seen.add(k);
    return { error, duplicate };
  });
}

/** Divide in gruppi da n (la funzione server accetta al massimo 50 professori per chiamata). */
export function chunk<T>(items: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}
