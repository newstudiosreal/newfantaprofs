import { useState } from 'react';
import { ActionButton, Button, Empty, ErrorState, Field, Loading, Modal, Select } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useToast } from '@/hooks/useToast';
import {
  buyItem, buyListing, buyRotating, claimAuction, createListing, listListings, listPowerups, listRotations, placeBid, reclaimListing,
} from '@/lib/api';
import { explain, needsDrop } from '@/lib/errors';
import { timeLeft } from '@/lib/format';
import { SHOP } from '@/lib/premium';
import { useLeague } from './context';

type Tab = 'vetrina' | 'annunci' | 'negozio' | 'miei' | 'vendi';
const TABS: { id: Tab; label: string }[] = [
  { id: 'vetrina', label: 'Vetrina' }, { id: 'annunci', label: 'Annunci' }, { id: 'negozio', label: 'Negozio' },
  { id: 'miei', label: 'I miei' }, { id: 'vendi', label: 'Vendi' },
];

export function Market() {
  const { bundle, myTeam, myScore, teamProfs, profById, userById, meId, reload: reloadLeague } = useLeague();
  const { league } = bundle;
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('vetrina');
  const listings = useAsync(() => listListings(league.id), [league.id], { interval: 20_000, enabled: !!myTeam });
  const rotations = useAsync(() => listRotations(league.id), [league.id], { interval: 60_000, enabled: !!myTeam });
  const powerups = useAsync(() => listPowerups(league.id, meId), [league.id, meId], { enabled: !!myTeam });
  const [drop, setDrop] = useState<((dropId: string) => Promise<unknown>) | null>(null);

  const refresh = async () => { await Promise.all([listings.reload(), rotations.reload(), powerups.reload(), reloadLeague()]); };

  /** Esegue un acquisto; se la squadra è piena chiede quale professore eliminare e riprova. */
  const withDrop = (fn: (dropId?: string) => Promise<unknown>) => async () => {
    try { await fn(); await refresh(); }
    catch (e) {
      if (needsDrop(e)) { setDrop(() => async (id: string) => { await fn(id); await refresh(); }); return; }
      throw e;
    }
  };

  if (!myTeam) return <Empty title="Serve una squadra">Crea la tua squadra per accedere al mercato.</Empty>;

  const mine = teamProfs(myTeam.id);
  const all = listings.data ?? [];
  const open = all.filter(l => l.status === 'open' && l.seller_id !== meId);
  const myListings = all.filter(l => l.seller_id === meId && ['open', 'unsold', 'expired'].includes(l.status));
  const wonAuctions = all.filter(l => l.type === 'auction' && l.status === 'expired' && l.current_bidder === meId);
  const profName = (id: string) => profById(id)?.name ?? '?';

  return (
    <>
      <div className="card row between" style={{ background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'var(--accent)' }}>
        <b>Punti da spendere</b><span className="score">{myScore}</span>
      </div>
      <div className="row row-wrap" style={{ margin: '12px 0' }} role="tablist">
        {TABS.map(t => <Button key={t.id} size="sm" variant={tab === t.id ? 'primary' : 'default'} onClick={() => setTab(t.id)} role="tab" aria-selected={tab === t.id}>{t.label}</Button>)}
      </div>
      {(listings.error != null) && <ErrorState error={listings.error} onRetry={listings.reload} />}

      {tab === 'vetrina' && (
        <>
          <p className="muted small">Offerte speciali che cambiano ogni 48 ore. Prezzo fisso, un solo acquirente per prof.</p>
          {rotations.loading && !rotations.data && <Loading rows={2} />}
          {rotations.data && !rotations.data.length && <Empty title="Vetrina vuota">Servono professori nella lega.</Empty>}
          <div className="grid grid-2">
            {rotations.data?.map(r => {
              const taken = !!r.bought_by; const canPay = myScore >= r.price; const p = profById(r.professor_id);
              return (
                <div key={r.id} className="prof-card" style={taken ? { opacity: .55 } : undefined}>
                  <div className="row"><span className="prof-photo" aria-hidden="true">{p?.name[0]}</span>
                    <span className="grow"><b>{p?.name}</b><div className="muted small">{p?.subject || '—'}</div></span><span className="badge badge-accent">Offerta</span></div>
                  <div className="row between"><span className="pts">{r.price} pt</span>
                    {taken ? <span className="badge">{r.bought_by === meId ? 'Già tuo' : `Preso da ${userById(r.bought_by!)?.username ?? '?'}`}</span>
                      : <ActionButton variant="primary" size="sm" disabled={!canPay} okMessage="Acquistato!" onAction={withDrop(d => buyRotating(r.id, d))}>{canPay ? 'Acquista' : `Servono ${r.price} pt`}</ActionButton>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === 'annunci' && (
        <>
          {listings.loading && !listings.data && <Loading rows={3} />}
          {listings.data && !open.length && <Empty title="Nessun prof in vendita">Quando un giocatore mette un prof sul mercato lo trovi qui.</Empty>}
          <div className="stack">
            {open.map(l => {
              const price = l.type === 'direct' ? l.price! : (l.current_bid ?? l.min_bid!);
              return (
                <div key={l.id} className="card">
                  <div className="row between"><b>{profName(l.professor_id)}</b><span className="badge">{l.type === 'auction' ? 'Asta' : 'Diretto'}</span></div>
                  <p className="muted small" style={{ margin: '2px 0 8px' }}>{profById(l.professor_id)?.subject || '—'} · venditore {userById(l.seller_id)?.username ?? '?'}</p>
                  {l.type === 'direct' ? (
                    <div className="row between"><span className="pts">{price} pt</span>
                      <ActionButton variant="primary" size="sm" disabled={myScore < price} okMessage="Acquistato!" onAction={withDrop(d => buyListing(l.id, d))}>{myScore < price ? 'Punti insufficienti' : 'Compra'}</ActionButton></div>
                  ) : <AuctionRow l={l} myScore={myScore} meId={meId} refresh={refresh} bidderName={l.current_bidder ? userById(l.current_bidder)?.username : undefined} />}
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === 'negozio' && (
        <div className="stack">
          {SHOP.map(s => (
            <div key={s.id} className="card row">
              <span style={{ fontSize: '1.8rem' }} aria-hidden="true">{s.icon}</span>
              <span className="grow"><b>{s.label}</b><div className="muted small">{s.desc}</div></span>
              <ActionButton variant="primary" size="sm" disabled={myScore < s.price} okMessage={`${s.label} acquistato`}
                onAction={withDrop(async d => { const r = await buyItem(league.id, s.id, d); if (s.id === 'joker') toast.ok(`Jolly! Hai ricevuto ${r}`); })}>{s.price} pt</ActionButton>
            </div>
          ))}
          <div className="card-flat small muted">Power-up attivi: {powerups.data?.length ? powerups.data.map(u => (u.kind === 'shield' ? '🛡️ Scudo' : '⚡ Moltiplicatore')).join(', ') : 'nessuno'}</div>
        </div>
      )}

      {tab === 'miei' && (
        <>
          {wonAuctions.length > 0 && <div className="section-title" style={{ marginTop: 0 }}><h2>Aste vinte</h2></div>}
          <div className="stack">
            {wonAuctions.map(l => (
              <div key={l.id} className="card row between"><span><b>{profName(l.professor_id)}</b><div className="muted small">Hai vinto a {l.current_bid} pt</div></span>
                <ActionButton variant="primary" size="sm" okMessage="Prof ritirato!" onAction={withDrop(d => claimAuction(l.id, d))}>Ritira e paga</ActionButton></div>
            ))}
          </div>
          <div className="section-title"><h2>I miei annunci</h2></div>
          {!myListings.length && <Empty title="Nessun annuncio">Metti in vendita un prof dalla scheda Vendi.</Empty>}
          <div className="stack">
            {myListings.map(l => {
              const canReclaim = (l.status === 'open' && (l.type === 'direct' || !l.current_bidder)) || l.status === 'unsold' || (l.status === 'expired' && !!l.expires_at && new Date(l.expires_at).getTime() < Date.now() - 48 * 3_600_000);
              return (
                <div key={l.id} className="card">
                  <div className="row between"><b>{profName(l.professor_id)}</b><span className="badge">{l.type === 'auction' ? 'Asta' : 'Diretto'} · {l.status === 'open' ? 'aperto' : l.status === 'unsold' ? 'invenduto' : 'chiusa'}</span></div>
                  <p className="muted small" style={{ margin: '4px 0 8px' }}>
                    {l.type === 'direct' ? `Prezzo ${l.price} pt` : `Offerta ${l.current_bid} pt${l.current_bidder ? ` di ${userById(l.current_bidder)?.username}` : ' (nessuna offerta)'} · ${l.status === 'open' ? timeLeft(l.expires_at) : 'in attesa del vincitore'}`}
                  </p>
                  {canReclaim && <ActionButton size="sm" okMessage="Prof tornato in squadra" onAction={withDrop(d => reclaimListing(l.id, d))}>{l.status === 'open' ? 'Ritira annuncio' : 'Riprendi il prof'}</ActionButton>}
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === 'vendi' && <SellForm profs={mine.map(p => ({ id: p.id, name: p.name }))} onDone={async () => { await refresh(); setTab('miei'); }} leagueId={league.id} />}

      {drop && (
        <Modal title="Squadra piena" onClose={() => setDrop(null)}>
          <p className="muted">Hai già 4 professori. Scegli quale eliminare per far posto al nuovo.</p>
          <div className="stack">
            {mine.map(p => (
              <ActionButton key={p.id} block onAction={async () => { try { await drop(p.id); setDrop(null); toast.ok('Fatto!'); } catch (e) { toast.error(explain(e)); setDrop(null); } }}>Elimina {p.name}</ActionButton>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

function AuctionRow({ l, myScore, meId, refresh, bidderName }: { l: import('@/lib/types').Listing; myScore: number; meId: string; refresh: () => Promise<void>; bidderName?: string }) {
  const cur = l.current_bid ?? l.min_bid ?? 0;
  const [bid, setBid] = useState(String(cur + 10));
  const leading = l.current_bidder === meId;
  return (
    <>
      <div className="row between small"><span>Offerta attuale <b>{cur} pt</b>{bidderName ? ` (${bidderName})` : ''}</span><span className="badge">{timeLeft(l.expires_at)}</span></div>
      {leading ? <p className="badge badge-pos" style={{ marginTop: 8 }}>Sei il miglior offerente</p> : (
        <div className="row" style={{ marginTop: 8 }}>
          <input className="input" inputMode="numeric" value={bid} onChange={e => setBid(e.target.value.replace(/\D/g, ''))} aria-label="La tua offerta" />
          <ActionButton variant="primary" disabled={!bid || Number(bid) <= cur || Number(bid) > myScore} okMessage="Offerta inviata" onAction={async () => { await placeBid(l.id, Number(bid)); await refresh(); }}>Offri</ActionButton>
        </div>
      )}
    </>
  );
}

function SellForm({ profs, leagueId, onDone }: { profs: { id: string; name: string }[]; leagueId: string; onDone: () => Promise<void> }) {
  const [prof, setProf] = useState(''); const [type, setType] = useState<'direct' | 'auction'>('direct'); const [amount, setAmount] = useState('100');
  if (profs.length <= 1) return <Empty title="Non puoi vendere">Devi tenere almeno un professore in squadra.</Empty>;
  const n = Number(amount);
  return (
    <div className="card">
      <Field label="Quale prof"><Select value={prof} onChange={setProf} aria-label="Prof da vendere"><option value="">Scegli</option>{profs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
      <div className="row" style={{ marginBottom: 12 }}>
        <Button size="sm" variant={type === 'direct' ? 'primary' : 'default'} onClick={() => setType('direct')}>Prezzo fisso</Button>
        <Button size="sm" variant={type === 'auction' ? 'primary' : 'default'} onClick={() => setType('auction')}>Asta (12 ore)</Button>
      </div>
      <Field label={type === 'direct' ? 'Prezzo (50-1000 pt)' : 'Offerta minima (50-1000 pt)'}>
        <input className="input" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, ''))} />
      </Field>
      <ActionButton variant="primary" block disabled={!prof || n < 50 || n > 1000} okMessage="Annuncio pubblicato" onAction={async () => { await createListing(leagueId, prof, type, n); await onDone(); }}>Pubblica</ActionButton>
      <p className="hint">Il prof esce dalla tua squadra subito. Se nessuno lo compra puoi riprenderlo.</p>
    </div>
  );
}

