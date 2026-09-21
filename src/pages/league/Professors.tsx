import { useMemo, useState } from 'react';
import { ActionButton, Button, ConfirmModal, Empty, ErrorState, Field, Loading, Modal, Pts } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { addProfessors, deleteProfessor, listProfessorEvents } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import type { Professor } from '@/lib/types';
import { useLeague } from './context';

function History({ prof, onClose }: { prof: Professor; onClose: () => void }) {
  const { data, error, loading, reload } = useAsync(() => listProfessorEvents(prof.id), [prof.id]);
  return (
    <Modal title={prof.name} onClose={onClose}>
      <p className="muted small">{prof.subject || 'Materia non indicata'} · {prof.cost} crediti</p>
      {loading && <Loading rows={3} />}
      {error != null && <ErrorState error={error} onRetry={reload} />}
      {data && !data.length && <Empty title="Nessun evento">Questo prof non ha ancora fatto punti.</Empty>}
      {data?.map(e => (
        <div key={e.id} className="row between" style={{ padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
          <span style={{ minWidth: 0 }}><span className="ellipsis" style={{ display: 'block' }}>{e.label}</span><span className="muted tiny">{timeAgo(e.created_at)}</span></span>
          <Pts value={e.pts} />
        </div>
      ))}
    </Modal>
  );
}

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
  const { bundle, isAdmin, reload } = useLeague();
  const { professors, profScores, league, teamProfessors } = bundle;
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Professor | null>(null);
  const [adding, setAdding] = useState(false);
  const [lines, setLines] = useState('');
  const [del, setDel] = useState<Professor | null>(null);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return professors
      .filter(p => !s || p.name.toLowerCase().includes(s) || p.subject.toLowerCase().includes(s))
      .sort((a, b) => (profScores[b.id]?.pts ?? 0) - (profScores[a.id]?.pts ?? 0));
  }, [professors, profScores, q]);

  return (
    <>
      <div className="row between row-wrap" style={{ marginBottom: 12 }}>
        <input className="input" style={{ maxWidth: 320 }} placeholder="Cerca per nome o materia" value={q} onChange={e => setQ(e.target.value)} aria-label="Cerca professori" />
        {isAdmin && <Button variant="primary" onClick={() => setAdding(true)}>Aggiungi professori</Button>}
      </div>

      {!professors.length && <Empty title="Nessun professore">{isAdmin ? 'Aggiungi i professori della classe per far partire la lega.' : "L'admin non ha ancora aggiunto i professori."}</Empty>}
      {professors.length > 0 && !list.length && <Empty title="Nessun risultato">Prova con un altro nome.</Empty>}

      <div className="grid grid-3">
        {list.map(p => {
          const pts = profScores[p.id]?.pts ?? 0;
          const owners = teamProfessors.filter(tp => tp.professor_id === p.id).length;
          return (
            <div key={p.id} className="prof-card">
              <button className="row" style={{ all: 'unset', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center' }} onClick={() => setSel(p)} aria-label={`Storico di ${p.name}`}>
                <span className="prof-photo" aria-hidden="true">{p.name[0]}</span>
                <span style={{ minWidth: 0 }}><b className="ellipsis" style={{ display: 'block' }}>{p.name}</b><span className="muted small">{p.subject || '—'}</span></span>
              </button>
              <div className="row between">
                <span className="cost">{p.cost}<small>CREDITI</small></span>
                <span style={{ textAlign: 'right' }}><Pts value={pts} /><div className="tiny muted">in {owners} {owners === 1 ? 'squadra' : 'squadre'}</div></span>
              </div>
              {isAdmin && <Button size="sm" variant="danger" onClick={() => setDel(p)}>Rimuovi dalla lega</Button>}
            </div>
          );
        })}
      </div>

      {sel && <History prof={sel} onClose={() => setSel(null)} />}
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
