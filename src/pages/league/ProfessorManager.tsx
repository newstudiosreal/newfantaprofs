import { useMemo, useRef, useState } from 'react';
import { ActionButton, Button, Modal } from '@/components/ui';
import { addProfessors } from '@/lib/api';
import { updateProfessors, type ProfChange } from '@/lib/api.professors';
import { checkProfRows, chunk, parseProfLine, parseProfText, type ProfRow } from '@/lib/profimport';
import type { Professor } from '@/lib/types';

const smallInput = { minWidth: 0 } as const;
const err = { color: 'var(--danger, #ff6b6b)' } as const;

function SubjectList({ id, subjects }: { id: string; subjects: string[] }) {
  return <datalist id={id}>{subjects.map(s => <option key={s} value={s} />)}</datalist>;
}

/** Aggiunta veloce: scrivi un nome e premi Invio, oppure incolla un elenco. Tutto resta modificabile prima di salvare. */
export function AddProfessorsModal({ leagueId, existing, onClose, onDone }: {
  leagueId: string; existing: Professor[]; onClose: () => void; onDone: () => Promise<unknown> | void;
}) {
  const [rows, setRows] = useState<ProfRow[]>([]);
  const [subject, setSubject] = useState('');
  const [cost, setCost] = useState(10);
  const [quick, setQuick] = useState('');
  const [paste, setPaste] = useState('');
  const nextKey = useRef(1);
  const quickRef = useRef<HTMLInputElement>(null);
  const defaults = { subject: subject.trim(), cost };
  const subjects = useMemo(() => [...new Set(existing.map(p => p.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it')), [existing]);
  const checks = useMemo(() => checkProfRows(rows, existing.map(p => p.name)), [rows, existing]);

  const addQuick = () => {
    const r = parseProfLine(quick, defaults, nextKey.current);
    if (!r) return;
    nextKey.current += 1;
    setRows(cur => [...cur, r]);
    setQuick('');
    quickRef.current?.focus();
  };
  const addPaste = () => {
    const parsed = parseProfText(paste, defaults, nextKey.current);
    nextKey.current += parsed.length;
    setRows(cur => [...cur, ...parsed]);
    setPaste('');
  };
  const edit = (key: number, patch: Partial<ProfRow>) => setRows(cur => cur.map(r => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: number) => setRows(cur => cur.filter(r => r.key !== key));

  const ok = rows.filter((_, i) => !checks[i].error && !checks[i].duplicate);
  const dups = checks.filter(c => c.duplicate).length;
  const bad = checks.filter(c => c.error).length;

  const save = async () => {
    let added = 0;
    try {
      for (const part of chunk(ok, 50)) {
        await addProfessors(leagueId, part.map(r => ({ name: r.name.trim().replace(/\s+/g, ' '), subject: r.subject.trim(), cost: r.cost as number })));
        added += part.length;
        setRows(cur => cur.filter(r => !part.some(p => p.key === r.key)));
      }
    } finally { if (added) await onDone(); }
    onClose();
  };

  return (
    <Modal title="Aggiungi professori" onClose={onClose}>
      <SubjectList id="pm-subjects" subjects={subjects} />
      <div className="stack">
        <div className="row row-wrap" style={{ gap: 8 }}>
          <label className="field grow" style={{ margin: 0, minWidth: 140 }}><span>Materia predefinita</span>
            <input className="input" list="pm-subjects" value={subject} maxLength={40} onChange={e => setSubject(e.target.value)} placeholder="(facoltativa)" /></label>
          <label className="field" style={{ margin: 0, width: 110 }}><span>Costo predefinito</span>
            <input className="input" type="number" inputMode="numeric" min={1} max={50} value={cost} onChange={e => setCost(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} /></label>
        </div>

        <label className="field" style={{ margin: 0 }}><span>Scrivi un professore e premi Invio</span>
          <div className="row" style={{ gap: 8 }}>
            <input ref={quickRef} className="input grow" value={quick} maxLength={120} autoFocus enterKeyHint="done"
              onChange={e => setQuick(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addQuick(); } }}
              placeholder="Mario Rossi   ·   Rossi; Mate; 12   ·   Rossi 12" />
            <Button onClick={addQuick} disabled={!quick.trim()}>Aggiungi</Button>
          </div>
          <div className="hint">Se non scrivi materia o costo uso quelli predefiniti. Il numero (1-50) è sempre il costo.</div>
        </label>

        <details>
          <summary className="small bold" style={{ cursor: 'pointer' }}>Incolla un elenco (da Excel, appunti, WhatsApp)</summary>
          <textarea className="input" rows={5} style={{ marginTop: 8 }} value={paste} onChange={e => setPaste(e.target.value)}
            placeholder={'Mario Rossi; Matematica; 12\nAnna Verdi; Italiano; 8\nLuca Bianchi 9'} />
          <Button style={{ marginTop: 8 }} onClick={addPaste} disabled={!paste.trim()}>Aggiungi all'elenco</Button>
        </details>

        {rows.length > 0 && (
          <div className="stack" style={{ gap: 8 }}>
            <div className="row between"><b className="small">Da aggiungere ({rows.length})</b>
              <Button size="sm" variant="ghost" onClick={() => setRows([])}>Svuota</Button></div>
            {rows.map((r, i) => {
              const c = checks[i];
              return (
                <div key={r.key} className="card" style={{ padding: 8, borderColor: c.error ? 'var(--danger, #ff6b6b)' : c.duplicate ? 'var(--accent)' : undefined }}>
                  <div className="row" style={{ gap: 6 }}>
                    <input className="input grow" style={smallInput} value={r.name} maxLength={60} aria-label="Nome" onChange={e => edit(r.key, { name: e.target.value })} />
                    <Button size="sm" variant="ghost" aria-label={`Togli ${r.name}`} onClick={() => remove(r.key)}>✕</Button>
                  </div>
                  <div className="row" style={{ gap: 6, marginTop: 6 }}>
                    <input className="input grow" style={smallInput} list="pm-subjects" value={r.subject} maxLength={60} placeholder="Materia" aria-label="Materia" onChange={e => edit(r.key, { subject: e.target.value })} />
                    <input className="input" style={{ width: 76 }} type="number" inputMode="numeric" min={1} max={50} value={r.cost ?? ''} aria-label="Costo"
                      onChange={e => edit(r.key, { cost: e.target.value === '' ? null : Number(e.target.value) })} />
                  </div>
                  {c.error && <div className="tiny" style={{ ...err, marginTop: 4 }}>{c.error}</div>}
                  {!c.error && c.duplicate && <div className="tiny muted" style={{ marginTop: 4 }}>⚠️ Già presente: viene saltato (cambia il nome per aggiungerlo lo stesso).</div>}
                </div>
              );
            })}
          </div>
        )}

        <ActionButton variant="primary" block disabled={!ok.length || bad > 0} okMessage="Professori aggiunti" onAction={save}>
          {ok.length ? `Aggiungi ${ok.length} ${ok.length === 1 ? 'professore' : 'professori'}` : 'Aggiungi'}
        </ActionButton>
        {(bad > 0 || dups > 0) && <p className="hint" style={{ margin: 0 }}>{bad > 0 ? `${bad} righe con errori da correggere. ` : ''}{dups > 0 ? `${dups} doppioni saltati.` : ''}</p>}
      </div>
    </Modal>
  );
}

interface Draft { name: string; subject: string; cost: number | null }

/** Modifica dei professori già inseriti: cambi direttamente nella lista, anche in blocco, e salvi tutto insieme. */
export function EditProfessorsModal({ leagueId, professors, owners, initialQuery = '', onClose, onDone }: {
  leagueId: string; professors: Professor[]; owners: Record<string, number>; initialQuery?: string; onClose: () => void; onDone: () => Promise<unknown> | void;
}) {
  const [q, setQ] = useState(initialQuery);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkCost, setBulkCost] = useState('');
  const [bulkSubject, setBulkSubject] = useState('');
  const subjects = useMemo(() => [...new Set(professors.map(p => p.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it')), [professors]);
  const cur = (p: Professor): Draft => draft[p.id] ?? { name: p.name, subject: p.subject, cost: p.cost };
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return professors.filter(p => !k || p.name.toLowerCase().includes(k) || p.subject.toLowerCase().includes(k)).sort((a, b) => a.name.localeCompare(b.name, 'it'));
  }, [professors, q]);

  const changes: ProfChange[] = [];
  const errors: Record<string, string> = {};
  for (const p of professors) {
    const d = draft[p.id]; if (!d) continue;
    const name = d.name.trim().replace(/\s+/g, ' '); const subject = d.subject.trim();
    if (name.length < 2 || name.length > 40) errors[p.id] = 'Nome da 2 a 40 caratteri';
    else if (subject.length > 40) errors[p.id] = 'Materia oltre 40 caratteri';
    else if (d.cost === null || !Number.isInteger(d.cost) || d.cost < 1 || d.cost > 50) errors[p.id] = 'Costo da 1 a 50';
    const c: ProfChange = { id: p.id };
    if (name !== p.name) c.name = name;
    if (subject !== p.subject) c.subject = subject;
    if (d.cost !== p.cost && d.cost !== null) c.cost = d.cost;
    if (Object.keys(c).length > 1) changes.push(c);
  }
  const nErr = Object.keys(errors).length;
  const set = (p: Professor, patch: Partial<Draft>) => setDraft(d => ({ ...d, [p.id]: { ...cur(p), ...patch } }));
  const toggle = (id: string) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allShown = shown.length > 0 && shown.every(p => sel.has(p.id));
  const applyBulk = (patch: (p: Professor) => Partial<Draft>) => { for (const p of professors) if (sel.has(p.id)) set(p, patch(p)); };
  const costNum = Number(bulkCost);

  return (
    <Modal title="Modifica professori" onClose={onClose}>
      <SubjectList id="pm-subjects-edit" subjects={subjects} />
      <div className="stack">
        <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca per nome o materia" aria-label="Cerca" />
        <div className="row row-wrap" style={{ gap: 8 }}>
          <label className="row small" style={{ gap: 6 }}>
            <input type="checkbox" checked={allShown} onChange={() => setSel(allShown ? new Set() : new Set(shown.map(p => p.id)))} /> Seleziona tutti ({shown.length})
          </label>
        </div>
        {sel.size > 0 && (
          <div className="card stack" style={{ padding: 10, gap: 8 }}>
            <b className="small">{sel.size} selezionati: cambia in blocco</b>
            <div className="row" style={{ gap: 6 }}>
              <input className="input" style={{ width: 90 }} type="number" inputMode="numeric" min={1} max={50} value={bulkCost} placeholder="Costo" aria-label="Costo per i selezionati" onChange={e => setBulkCost(e.target.value)} />
              <Button disabled={!(Number.isInteger(costNum) && costNum >= 1 && costNum <= 50)} onClick={() => applyBulk(() => ({ cost: costNum }))}>Applica costo</Button>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <input className="input grow" style={smallInput} list="pm-subjects-edit" value={bulkSubject} maxLength={40} placeholder="Materia" aria-label="Materia per i selezionati" onChange={e => setBulkSubject(e.target.value)} />
              <Button disabled={!bulkSubject.trim()} onClick={() => applyBulk(() => ({ subject: bulkSubject.trim() }))}>Applica materia</Button>
            </div>
          </div>
        )}

        {!shown.length && <p className="muted small">Nessun professore trovato.</p>}
        {shown.map(p => {
          const d = cur(p);
          const changed = !!draft[p.id] && changes.some(c => c.id === p.id);
          return (
            <div key={p.id} className="card" style={{ padding: 8, borderColor: errors[p.id] ? 'var(--danger, #ff6b6b)' : changed ? 'var(--accent)' : undefined }}>
              <div className="row" style={{ gap: 6 }}>
                <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Seleziona ${p.name}`} />
                <input className="input grow" style={smallInput} value={d.name} maxLength={60} aria-label="Nome" onChange={e => set(p, { name: e.target.value })} />
              </div>
              <div className="row" style={{ gap: 6, marginTop: 6 }}>
                <input className="input grow" style={smallInput} list="pm-subjects-edit" value={d.subject} maxLength={60} placeholder="Materia" aria-label="Materia" onChange={e => set(p, { subject: e.target.value })} />
                <input className="input" style={{ width: 76 }} type="number" inputMode="numeric" min={1} max={50} value={d.cost ?? ''} aria-label="Costo"
                  onChange={e => set(p, { cost: e.target.value === '' ? null : Number(e.target.value) })} />
              </div>
              <div className="tiny muted" style={{ marginTop: 4 }}>
                {owners[p.id] ? `In ${owners[p.id]} ${owners[p.id] === 1 ? 'squadra' : 'squadre'}` : 'Libero'}{changed ? ' · modificato' : ''}
              </div>
              {errors[p.id] && <div className="tiny" style={err}>{errors[p.id]}</div>}
            </div>
          );
        })}

        <p className="hint" style={{ margin: 0 }}>Cambiare il costo non modifica le squadre già fatte: vale per le nuove squadre e per la ricostruzione a inizio stagione.</p>
        <div className="row" style={{ gap: 8 }}>
          <Button disabled={!changes.length && !nErr} onClick={() => { setDraft({}); setSel(new Set()); }}>Annulla modifiche</Button>
          <ActionButton variant="primary" className="grow" disabled={!changes.length || nErr > 0} okMessage="Modifiche salvate"
            onAction={async () => { await updateProfessors(leagueId, changes); await onDone(); onClose(); }}>
            {changes.length ? `Salva ${changes.length} ${changes.length === 1 ? 'modifica' : 'modifiche'}` : 'Salva'}
          </ActionButton>
        </div>
      </div>
    </Modal>
  );
}
