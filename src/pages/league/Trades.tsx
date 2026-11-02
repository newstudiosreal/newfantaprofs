import { useState } from 'react';
import { ActionButton, Button, Empty, ErrorState, Field, Loading, Modal, Select } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { cancelTrade, listTrades, respondTrade } from '@/lib/api';
import { counterTrade, proposeTradeMulti } from '@/lib/api.game';
import { fmtDateTime, timeLeft } from '@/lib/format';
import type { Professor, Trade } from '@/lib/types';
import { useLeague } from './context';

const STATUS: Record<Trade['status'], string> = {
  pending: 'In attesa', accepted: 'Accettato', rejected: 'Rifiutato', cancelled: 'Annullato', expired: 'Scaduto', countered: 'Controfferta',
};
const MAX_SIDE = 2;

const givenBy = (t: Trade) => [t.from_prof, t.from_prof2].filter((x): x is string => !!x);
const askedOf = (t: Trade) => [t.to_prof, t.to_prof2].filter((x): x is string => !!x);

/** Scelta di 1-2 professori tra quelli dati. */
function ProfPicker({ label, profs, value, onChange, empty }: { label: string; profs: Professor[]; value: string[]; onChange: (v: string[]) => void; empty: string }) {
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(x => x !== id) : value.length >= MAX_SIDE ? value : [...value, id]);
  return (
    <fieldset style={{ border: 0, padding: 0, margin: '0 0 12px' }}>
      <legend className="small bold" style={{ marginBottom: 6 }}>{label} <span className="muted">(da 1 a {MAX_SIDE})</span></legend>
      {!profs.length ? <p className="muted small">{empty}</p> : (
        <div className="pick-grid">{profs.map(p => {
          const on = value.includes(p.id);
          return <Button key={p.id} size="sm" variant={on ? 'primary' : 'default'} aria-pressed={on} disabled={!on && value.length >= MAX_SIDE} onClick={() => toggle(p.id)}>{p.name}</Button>;
        })}</div>
      )}
    </fieldset>
  );
}

export function Trades() {
  const { bundle, meId, myTeam, teamProfs, profById, userById, reload: reloadLeague } = useLeague();
  const { league, teams } = bundle;
  const { data, error, loading, reload } = useAsync(() => listTrades(league.id), [league.id], { interval: 20_000 });
  const [toUser, setToUser] = useState('');
  const [give, setGive] = useState<string[]>([]);
  const [ask, setAsk] = useState<string[]>([]);
  const [counter, setCounter] = useState<Trade | null>(null);
  const [cGive, setCGive] = useState<string[]>([]);
  const [cAsk, setCAsk] = useState<string[]>([]);

  const others = teams.filter(t => t.owner_id !== meId);
  const theirTeam = teams.find(t => t.owner_id === toUser);
  const refresh = async () => { await Promise.all([reload(), reloadLeague()]); };
  const nameOf = (uid: string) => userById(uid)?.username ?? '?';
  const names = (ids: string[]) => ids.map(id => profById(id)?.name ?? '?').join(' + ');

  const pending = (data ?? []).filter(t => t.status === 'pending' && (t.from_user === meId || t.to_user === meId));
  const history = (data ?? []).filter(t => t.status !== 'pending' && (t.from_user === meId || t.to_user === meId));
  const valid = !!toUser && give.length >= 1 && ask.length >= 1;

  const openCounter = (t: Trade) => { setCounter(t); setCGive(askedOf(t)); setCAsk(givenBy(t)); };

  return (
    <>
      <div className="section-title" style={{ marginTop: 0 }}><h2>Proponi uno scambio</h2></div>
      {!myTeam ? <Empty title="Serve una squadra">Crea la tua squadra per proporre scambi.</Empty>
        : !others.length ? <Empty title="Nessun avversario">Serve almeno un'altra squadra nella lega.</Empty> : (
          <div className="card">
            <Field label="Con chi"><Select value={toUser} onChange={v => { setToUser(v); setAsk([]); }} aria-label="Con chi scambiare">
              <option value="">Scegli un giocatore</option>{others.map(t => <option key={t.id} value={t.owner_id}>{nameOf(t.owner_id)} — {t.name}</option>)}</Select></Field>
            <ProfPicker label="I tuoi prof da dare" profs={teamProfs(myTeam.id)} value={give} onChange={setGive} empty="La tua squadra è vuota." />
            <ProfPicker label="I suoi prof che chiedi" profs={theirTeam ? teamProfs(theirTeam.id) : []} value={ask} onChange={setAsk} empty={theirTeam ? 'Squadra vuota.' : 'Scegli prima un giocatore.'} />
            {valid && <p className="small" style={{ margin: '0 0 10px' }}>Dai <b>{names(give)}</b> · ricevi <b>{names(ask)}</b></p>}
            <ActionButton variant="primary" block disabled={!valid} okMessage="Proposta inviata (valida 10 ore)"
              onAction={async () => { await proposeTradeMulti(league.id, toUser, give, ask); setGive([]); setAsk([]); await refresh(); }}>Invia proposta</ActionButton>
            <p className="hint">Scambi 1 a 1, 2 a 1, 1 a 2 o 2 a 2: ogni squadra deve restare entro i 4 professori. Vale 10 ore. Se un capitano cambia squadra perde la fascia.</p>
          </div>
        )}

      <div className="section-title"><h2>In attesa</h2></div>
      {loading && !data && <Loading rows={2} />}
      {error != null && <ErrorState error={error} onRetry={reload} />}
      {data && !pending.length && <Empty title="Nessuno scambio aperto">Le proposte che invii o ricevi compaiono qui.</Empty>}
      <div className="stack">
        {pending.map(t => {
          const incoming = t.to_user === meId;
          return (
            <div key={t.id} className="card">
              <div className="row between row-wrap"><b>{incoming ? `${nameOf(t.from_user)} ti propone` : `Proposta a ${nameOf(t.to_user)}`}{t.counter_of ? ' (controfferta)' : ''}</b><span className="badge">scade tra {timeLeft(t.expires_at)}</span></div>
              <p style={{ margin: '8px 0' }}>{incoming ? 'Ricevi' : 'Dai'} <b>{names(givenBy(t))}</b> · {incoming ? 'dai' : 'ricevi'} <b>{names(askedOf(t))}</b></p>
              <div className="row row-wrap">
                {incoming ? (
                  <>
                    <ActionButton variant="primary" size="sm" okMessage="Scambio completato!" onAction={async () => { await respondTrade(t.id, true); await refresh(); }}>Accetta</ActionButton>
                    <Button size="sm" onClick={() => openCounter(t)}>Controfferta</Button>
                    <ActionButton size="sm" onAction={async () => { await respondTrade(t.id, false); await refresh(); }}>Rifiuta</ActionButton>
                  </>
                ) : <ActionButton size="sm" variant="danger" onAction={async () => { await cancelTrade(t.id); await refresh(); }}>Annulla proposta</ActionButton>}
              </div>
            </div>
          );
        })}
      </div>

      {history.length > 0 && (
        <>
          <div className="section-title"><h2>Storico</h2></div>
          <div className="card">{history.map(t => (
            <div key={t.id} className="row between small" style={{ padding: '7px 0', borderBottom: '1px solid var(--line)', gap: 8 }}>
              <span style={{ minWidth: 0 }}>{nameOf(t.from_user)} ⇄ {nameOf(t.to_user)}: {names(givenBy(t))} / {names(askedOf(t))}</span>
              <span className="muted tiny" style={{ whiteSpace: 'nowrap' }}>{STATUS[t.status]} · {fmtDateTime(t.created_at)}</span></div>
          ))}</div>
        </>
      )}

      {counter && myTeam && (
        <Modal title="Controfferta" onClose={() => setCounter(null)}>
          <p className="muted small">La proposta di {nameOf(counter.from_user)} viene chiusa e gli mandi la tua versione.</p>
          <ProfPicker label="I tuoi prof che dai" profs={teamProfs(myTeam.id)} value={cGive} onChange={setCGive} empty="La tua squadra è vuota." />
          <ProfPicker label="I suoi prof che chiedi" profs={(teams.find(t => t.owner_id === counter.from_user) ? teamProfs(teams.find(t => t.owner_id === counter.from_user)!.id) : [])} value={cAsk} onChange={setCAsk} empty="Squadra vuota." />
          <ActionButton variant="primary" block disabled={!cGive.length || !cAsk.length} okMessage="Controfferta inviata"
            onAction={async () => { await counterTrade(counter.id, cGive, cAsk); setCounter(null); await refresh(); }}>Invia controfferta</ActionButton>
        </Modal>
      )}
    </>
  );
}
