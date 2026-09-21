import { useState } from 'react';
import { ActionButton, Empty, ErrorState, Field, Loading, Select } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { cancelTrade, listTrades, proposeTrade, respondTrade } from '@/lib/api';
import { fmtDateTime, timeLeft } from '@/lib/format';
import type { Trade } from '@/lib/types';
import { useLeague } from './context';

const STATUS: Record<Trade['status'], string> = {
  pending: 'In attesa', accepted: 'Accettato', rejected: 'Rifiutato', cancelled: 'Annullato', expired: 'Scaduto',
};

export function Trades() {
  const { bundle, meId, myTeam, teamProfs, profById, userById, reload: reloadLeague } = useLeague();
  const { league, teams } = bundle;
  const { data, error, loading, reload } = useAsync(() => listTrades(league.id), [league.id], { interval: 20_000 });
  const [toUser, setToUser] = useState('');
  const [fromProf, setFromProf] = useState('');
  const [toProf, setToProf] = useState('');

  const others = teams.filter(t => t.owner_id !== meId);
  const theirTeam = teams.find(t => t.owner_id === toUser);
  const refresh = async () => { await Promise.all([reload(), reloadLeague()]); };
  const nameOf = (uid: string) => userById(uid)?.username ?? '?';

  const pending = (data ?? []).filter(t => t.status === 'pending');
  const history = (data ?? []).filter(t => t.status !== 'pending' && (t.from_user === meId || t.to_user === meId));

  return (
    <>
      <div className="section-title" style={{ marginTop: 0 }}><h2>Proponi uno scambio</h2></div>
      {!myTeam ? <Empty title="Serve una squadra">Crea la tua squadra per proporre scambi.</Empty>
        : !others.length ? <Empty title="Nessun avversario">Serve almeno un'altra squadra nella lega.</Empty> : (
          <div className="card">
            <Field label="Con chi"><Select value={toUser} onChange={v => { setToUser(v); setToProf(''); }} aria-label="Con chi scambiare">
              <option value="">Scegli un giocatore</option>{others.map(t => <option key={t.id} value={t.owner_id}>{nameOf(t.owner_id)} — {t.name}</option>)}</Select></Field>
            <Field label="Il tuo prof"><Select value={fromProf} onChange={setFromProf} aria-label="Il tuo professore">
              <option value="">Scegli il tuo prof</option>{teamProfs(myTeam.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
            <Field label="Il loro prof"><Select value={toProf} onChange={setToProf} aria-label="Il loro professore">
              <option value="">{theirTeam ? 'Scegli il suo prof' : 'Scegli prima un giocatore'}</option>
              {theirTeam && teamProfs(theirTeam.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
            <ActionButton variant="primary" block disabled={!toUser || !fromProf || !toProf} okMessage="Proposta inviata (valida 10 ore)"
              onAction={async () => { await proposeTrade(league.id, toUser, fromProf, toProf); setFromProf(''); setToProf(''); await refresh(); }}>Invia proposta</ActionButton>
            <p className="hint">Lo scambio è 1 a 1 e vale 10 ore. Se un capitano cambia squadra perde la fascia.</p>
          </div>
        )}

      <div className="section-title"><h2>In attesa</h2></div>
      {loading && !data && <Loading rows={2} />}
      {error != null && <ErrorState error={error} onRetry={reload} />}
      {data && !pending.filter(t => t.from_user === meId || t.to_user === meId).length && <Empty title="Nessuno scambio aperto">Le proposte che invii o ricevi compaiono qui.</Empty>}
      <div className="stack">
        {pending.filter(t => t.from_user === meId || t.to_user === meId).map(t => {
          const incoming = t.to_user === meId;
          return (
            <div key={t.id} className="card">
              <div className="row between"><b>{incoming ? `${nameOf(t.from_user)} ti propone` : `Proposta a ${nameOf(t.to_user)}`}</b><span className="badge">scade tra {timeLeft(t.expires_at)}</span></div>
              <p style={{ margin: '8px 0' }}>{incoming ? 'Ricevi' : 'Dai'} <b>{profById(t.from_prof)?.name ?? '?'}</b> · {incoming ? 'dai' : 'ricevi'} <b>{profById(t.to_prof)?.name ?? '?'}</b></p>
              <div className="row">
                {incoming ? (
                  <>
                    <ActionButton variant="primary" size="sm" okMessage="Scambio completato!" onAction={async () => { await respondTrade(t.id, true); await refresh(); }}>Accetta</ActionButton>
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
            <div key={t.id} className="row between small" style={{ padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
              <span>{nameOf(t.from_user)} ⇄ {nameOf(t.to_user)}: {profById(t.from_prof)?.name} / {profById(t.to_prof)?.name}</span>
              <span className="muted tiny">{STATUS[t.status]} · {fmtDateTime(t.created_at)}</span></div>
          ))}</div>
        </>
      )}
    </>
  );
}
