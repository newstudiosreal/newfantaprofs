import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicStats } from '@/lib/api.social';
import type { PublicStats } from '@/lib/types.social';
import { isConfigured } from '@/lib/supabase';
import { DEFAULT_BONUS, DEFAULT_MALUS } from '@/lib/catalog';
import { fmtPts } from '@/lib/format';

// Voci scelte dal catalogo reale degli eventi.
const SHOWCASE = ['assenza', 'video', 'sostituto', 'gita'].map(id => DEFAULT_BONUS.find(e => e.id === id)).filter(Boolean)
  .concat(DEFAULT_MALUS.slice(0, 3)) as typeof DEFAULT_BONUS;

const FAQ: { q: string; a: string }[] = [
  { q: 'Come funziona il gioco?', a: 'Entri in una lega (o ne crei una per la tua classe), scegli fino a 4 professori e ogni cosa che fanno in classe — assenze, ritardi, interrogazioni a sorpresa — porta o toglie punti alla tua squadra. Vince chi ha più punti a fine stagione.' },
  { q: 'Cosa sono i crediti?', a: 'Hai 50 crediti per comporre la squadra: ogni professore ha un costo. Il capitano che nomini vale doppio, quindi conviene sceglierlo con cura.' },
  { q: 'Quanto dura una stagione?', a: '30 giorni, poi 3 giorni di pausa in cui si rifà la squadra. A fine stagione la classifica viene archiviata e i punti ripartono da zero.' },
  { q: 'Come funziona il mercato?', a: 'Con i punti guadagnati puoi comprare professori da annunci e aste degli altri giocatori, dalla vetrina a rotazione e dal negozio dei power-up. Puoi anche proporre scambi 1 a 1.' },
  { q: 'Serve un\'email per registrarsi?', a: 'No: basta uno username e una password. Alla registrazione ricevi un codice di recupero: salvalo, perché senza email è l\'unico modo per rientrare se dimentichi la password.' },
  { q: 'Ho dimenticato la password: come faccio?', a: 'Dalla pagina di accesso scegli «Password dimenticata?» e inserisci username e codice di recupero. Se hai perso anche il codice, chiedi aiuto all\'amministratore.' },
];

export function Landing() {
  const [stats, setStats] = useState<PublicStats | null>(null);
  useEffect(() => {
    if (!isConfigured) return;
    let alive = true;
    publicStats().then(s => { if (alive && s) setStats(s); }).catch(() => undefined);   // se fallisce la striscia semplicemente non compare
    return () => { alive = false; };
  }, []);

  return (
    <main className="page">
      <section className="hero">
        <div>
          <h1>FANTAPROF</h1>
          <p className="tag"><span className="marker">Il fantasy dei prof.</span></p>
          <p className="muted" style={{ maxWidth: 460, fontSize: '1.05rem' }}>
            Crea la tua squadra di professori, gestisci i tuoi crediti e scala la classifica.
            Ogni assenza, ritardo o video in classe vale punti.
          </p>
          <div className="row row-wrap" style={{ marginTop: 20 }}>
            <Link to="/registrati" className="btn btn-primary btn-lg">Gioca ora</Link>
            <Link to="/regole" className="btn btn-lg">Come funziona</Link>
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <span className="muted small">Hai già un account?</span>
            <Link to="/accedi" className="small bold">Accedi</Link>
          </div>
        </div>

        <div className="board" aria-label="Esempi di punteggi">
          <h3>Registro di oggi</h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {SHOWCASE.map(e => (
              <li key={e.id}><span>{e.label}</span><span className={`p ${e.pts > 0 ? 'pos' : 'neg'}`}>{fmtPts(e.pts)}</span></li>
            ))}
          </ul>
        </div>
      </section>

      {stats && (stats.leagues > 0 || stats.players > 0) && (
        <section className="stats-strip" aria-label="FantaProf in numeri">
          <div><b>{stats.players.toLocaleString('it-IT')}</b><span>giocatori</span></div>
          <div><b>{stats.leagues.toLocaleString('it-IT')}</b><span>leghe</span></div>
          <div><b>{stats.events.toLocaleString('it-IT')}</b><span>eventi registrati</span></div>
        </section>
      )}

      <section style={{ marginTop: 46 }}>
        <h2>Come funziona</h2>
        <div className="steps" style={{ marginTop: 14 }}>
          <div className="step"><h3>Fai la lega</h3><p className="muted">Crea una lega per la tua classe e condividi il codice a sei caratteri con i compagni.</p></div>
          <div className="step"><h3>Scegli 4 prof</h3><p className="muted">Hai 50 crediti: ogni professore ha un costo. Il capitano vale doppio.</p></div>
          <div className="step"><h3>Scala la classifica</h3><p className="muted">L'admin registra gli eventi in classe e i punti arrivano subito. Compra, vendi e scambia prof nel mercato.</p></div>
        </div>
      </section>

      <section className="faq" style={{ marginTop: 46 }} aria-labelledby="faq-title">
        <h2 id="faq-title">Domande frequenti</h2>
        <div className="stack" style={{ marginTop: 14 }}>
          {FAQ.map(f => (
            <details key={f.q} className="card">
              <summary>{f.q}</summary>
              <p className="muted" style={{ margin: '10px 0 0' }}>{f.a}</p>
            </details>
          ))}
        </div>
        <p className="muted small" style={{ marginTop: 12 }}>Altre risposte nella pagina <Link to="/regole" className="bold">Regole</Link>.</p>
      </section>
    </main>
  );
}
