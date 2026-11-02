import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { WatchStar } from '@/components/game/WatchStar';
import { useWatchlist } from '@/components/game/useWatchlist';
import { ActionButton, Button, ConfirmModal, Empty, Field, Modal, Pts, Select } from '@/components/ui';
import { addProfessors, deleteProfessor } from '@/lib/api';
import { filterProfessors, type ProfFilter } from '@/lib/game';
import type { Professor } from '@/lib/types';
import { useLeague } from './context';

/** Formato: una riga per prof, "Nome; Materia; Costo". La materia è facoltativa: "Rossi; 12". */
export function parseProfLines(text: string): { name: string; subject: string; cost: number }[] {
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const parts = line.split(/[;,\t]/).map(s => s.trim());
    const cost = Number(parts[parts.length - 1]);
    if (parts.length < 2 || !Number.isInteger(cost) || cost < 1 || cost > 50) throw new Error(`Riga non valida: "${line}" (serve un costo da 1 a 50)`);
    return { name: parts[0], subject: parts.length > 2 ? parts[1] : '', cost };
  });
}

export function Professors() {
  const { bundle, isAdmin, reload, meId } = useLeague();
  const { professors, profScores, league, teamProfessors } = bundle;
  const [f, setF] = useState<ProfFilter>({ q: '', subject: '', cost: 'all', owned: 'all', sort: 'punti' });
  const [adding, setAdding] = useState(false);
  const [lines, setLines] = useState('');
  const [del, setDel] = useState<Professor | null>(null);
  const watch = useWatchlist(league.id, meId);
  const set = <K extends keyof ProfFilter>(k: K, v: ProfFilter[K]) => setF(cur => ({ ...cur, [k]: v }));

  const subjects = useMemo(() => [...new Set(professors.map(p => p.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it')), [professors]);
  const owners = useMemo(() => {
    const o: Record<string, number> = {};
    for (const tp of teamProfessors) o[tp.professor_id] = (o[tp.professor_id] ?? 0) + 1;
    return o;
  }, [teamProfessors]);
  const pts = useMemo(() => Object.fromEntries(professors.map(p => [p.id, profScores[p.id]?.pts ?? 0])), [professors, profScores]);
  const list = useMemo(() => filterProfessors(professors, pts, owners, f), [professors, pts, owners, f]);
  const filtering = !!(f.q || f.subject || f.cost !== 'all' || f.owned !== 'all');

  return (
    <>
      <div className="row between row-wrap" style={{ marginBottom: 12 }}>
        <input className="input" style={{ maxWidth: 320 }} placeholder="Cerca per nome o materia" value={f.q} onChange={e => set('q', e.target.value)} aria-label="Cerca professori" />
        {isAdmin && <Button variant="primary" onClick={() => setAdding(true)}>Aggiungi professori</Button>}
      </div>
      <div className="filters">
        <Select value={f.sort} onChange={v => set('sort', v as ProfFilter['sort'])} aria-label="Ordina per">
          <option value="punti">Ordina: punti</option><option value="nome">Ordina: nome</option><option value="costo">Ordina: costo</option></Select>
        <Select value={f.subject} onChange={v => set('subject', v)} aria-label="Materia"><option value="">Tutte le materie</option>{subjects.map(s => <option key={s} value={s}>{s}</option>)}</Select>
        <Select value={f.cost} onChange={v => set('cost', v as ProfFilter['cost'])} aria-label="Fascia di costo">
          <option value="all">Ogni costo</option><option value="low">1-10 crediti</option><option value="mid">11-20 crediti</option><option value="high">21+ crediti</option></Select>
        <Select value={f.owned} onChange={v => set('owned', v as ProfFilter['owned'])} aria-label="Disponibilità">
          <option value="all">Tutti</option><option value="owned">In squadra</option><option value="free">Liberi</option></Select>
      </div>

      {!professors.length && <Empty title="Nessun professore">{isAdmin ? 'Aggiungi i professori della classe per far partire la lega.' : "L'admin non ha ancora aggiunto i professori."}</Empty>}
      {professors.length > 0 && !list.length && <Empty title="Nessun risultato">{filtering ? 'Prova a togliere qualche filtro.' : 'Nessun professore.'}</Empty>}
      {filtering && list.length > 0 && <p className="muted small">{list.length} di {professors.length} professori</p>}

      <div className="grid grid-3">
        {list.map(p => {
          const n = owners[p.id] ?? 0;
          return (
            <div key={p.id} className="prof-card">
              <div className="row">
                <Link to={p.id} className="row grow" style={{ textDecoration: 'none', color: 'inherit', minWidth: 0 }} aria-label={`Scheda di ${p.name}`}>
                  <span className="prof-photo" aria-hidden="true">{p.name[0]}</span>
                  <span style={{ minWidth: 0 }}><b className="ellipsis" style={{ display: 'block' }}>{p.name}</b><span className="muted small">{p.subject || '—'}</span></span>
                </Link>
                <WatchStar on={watch.ids.has(p.id)} onToggle={() => void watch.toggle(p.id)} name={p.name} />
              </div>
              <div className="row between">
                <span className="cost">{p.cost}<small>CREDITI</small></span>
                <span style={{ textAlign: 'right' }}><Pts value={pts[p.id] ?? 0} /><div className="tiny muted">in {n} {n === 1 ? 'squadra' : 'squadre'}</div></span>
              </div>
              {isAdmin && <Button size="sm" variant="danger" onClick={() => setDel(p)}>Rimuovi dalla lega</Button>}
            </div>
          );
        })}
      </div>

      {del && <ConfirmModal danger title={`Rimuovere ${del.name}?`} confirmLabel="Rimuovi"
        text="Il professore esce da tutte le squadre e i suoi eventi vengono cancellati. Non si può annullare."
        onConfirm={async () => { await deleteProfessor(del.id); await reload(); }} onClose={() => setDel(null)} />}
      {adding && (
        <Modal title="Aggiungi professori" onClose={() => setAdding(false)}>
          <Field label="Un professore per riga" hint="Formato: Nome; Materia; Costo (1-50). Esempio: Mario Rossi; Matematica; 12">
            <textarea className="input" rows={7} value={lines} onChange={e => setLines(e.target.value)} placeholder={'Mario Rossi; Matematica; 12\nAnna Verdi; Italiano; 8'} autoFocus />
          </Field>
          <ActionButton variant="primary" block disabled={!lines.trim()} okMessage="Professori aggiunti"
            onAction={async () => { await addProfessors(league.id, parseProfLines(lines)); setLines(''); setAdding(false); await reload(); }}>Aggiungi</ActionButton>
        </Modal>
      )}
    </>
  );
}
