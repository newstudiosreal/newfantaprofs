import { DEFAULT_BONUS, DEFAULT_MALUS, DEFAULT_PREMI } from '@/lib/catalog';
import { fmtPts } from '@/lib/format';
import { SHOP } from '@/lib/premium';
import type { CatalogEvent } from '@/lib/types';

function EventList({ items }: { items: CatalogEvent[] }) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {items.map(e => (
        <li key={e.id} className="row between" style={{ padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
          <span>{e.label}{e.maxPerWeek ? <span className="muted tiny"> · max {e.maxPerWeek}/sett.</span> : null}</span>
          <span className={`pts ${e.pts > 0 ? 'pos' : 'neg'}`}>{fmtPts(e.pts)}</span>
        </li>
      ))}
    </ul>
  );
}

export function Rules() {
  return (
    <main className="page">
      <h1 style={{ fontSize: '3rem' }}>Come si gioca</h1>
      <p className="muted">FantaProf è il fantasy dei prof: scegli i professori, guarda cosa succede in classe, fai punti.</p>

      <div className="stack" style={{ marginTop: 16 }}>
        <section className="card"><h3>1. Lega</h3>
          <p className="muted" style={{ margin: 0 }}>Crea una lega o entra con il codice a 6 caratteri che ti dà l'admin. L'admin aggiunge i professori della classe e registra gli eventi.</p></section>
        <section className="card"><h3>2. Squadra</h3>
          <p className="muted" style={{ margin: 0 }}>Scegli fino a <b>4 professori</b> con un budget di <b>50 crediti</b>. Nomina un capitano: i suoi punti valgono <b>doppio</b>.</p></section>
        <section className="card"><h3>3. Punti</h3>
          <p className="muted" style={{ margin: 0 }}>Ogni evento (bonus, malus, premio) assegna punti al professore e quindi a tutte le squadre che lo hanno. La classifica somma i punti.</p></section>
        <section className="card"><h3>4. Stagione</h3>
          <p className="muted" style={{ margin: 0 }}>Ogni stagione dura <b>30 giorni</b>, poi <b>3 giorni di pausa</b>. I migliori entrano nella Hall of Fame globale.</p></section>
        <section className="card"><h3>5. Mercato</h3>
          <p className="muted">Con i punti guadagnati puoi comprare professori da annunci e aste (12 ore), dalla vetrina a rotazione (offerte ogni 48 ore) e dal negozio.</p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {SHOP.map(s => <li key={s.id}><b>{s.icon} {s.label}</b> ({s.price} pt) — <span className="muted">{s.desc}</span></li>)}
          </ul></section>
        <section className="card"><h3>6. Scambi, missioni e pronostici</h3>
          <p className="muted" style={{ margin: 0 }}>Proponi scambi 1 a 1 con gli altri giocatori (validi 10 ore), completa le missioni per punti extra e ogni settimana pronostica quale dei tuoi prof farà più punti: se ci prendi, <b>+60 pt</b>.</p></section>
      </div>

      <div className="section-title"><h2>Bonus</h2></div>
      <div className="card"><EventList items={DEFAULT_BONUS} /></div>
      <div className="section-title"><h2>Malus</h2></div>
      <div className="card"><EventList items={DEFAULT_MALUS} /></div>
      <div className="section-title"><h2>Premi speciali</h2></div>
      <div className="card"><EventList items={DEFAULT_PREMI} /></div>
      <p className="muted small" style={{ marginTop: 12 }}>Gli admin di lega possono aggiungere eventi personalizzati.</p>
    </main>
  );
}
