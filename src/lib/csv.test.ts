import { describe, expect, it } from 'vitest';
import { csvCell, safeFilename, toCsv } from './csv';

describe('csv', () => {
  it('mette gli apici e raddoppia le virgolette', () => {
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('dice "ciao"')).toBe('"dice ""ciao"""');
    expect(csvCell('riga\nnuova')).toBe('"riga\nnuova"');
  });
  it('lascia stare testo semplice, numeri e vuoti', () => {
    expect(csvCell('Rossi')).toBe('Rossi');
    expect(csvCell(42)).toBe('42');
    expect(csvCell(-35)).toBe('-35');
    expect(csvCell(null)).toBe('');
  });
  it('neutralizza le formule', () => {
    expect(csvCell('=SOMMA(A1)')).toBe("'=SOMMA(A1)");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('-cmd')).toBe("'-cmd");
  });
  it('produce BOM, separatore ; e CRLF', () => {
    const out = toCsv(['Squadra', 'Punti'], [['Alfa', 10], ['Be;ta', -5]]);
    expect(out.startsWith('﻿')).toBe(true);
    expect(out).toBe('﻿Squadra;Punti\r\nAlfa;10\r\n"Be;ta";-5\r\n');
  });
  it('safeFilename toglie accenti e simboli', () => {
    expect(safeFilename('Lega 3B — è bella!')).toBe('Lega_3B_e_bella');
    expect(safeFilename('???')).toBe('lega');
  });
});
