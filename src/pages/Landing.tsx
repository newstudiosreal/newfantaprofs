import { Link } from 'react-router-dom';
import { DEFAULT_BONUS, DEFAULT_MALUS } from '@/lib/catalog';
import { fmtPts } from '@/lib/format';

// Voci scelte dal catalogo reale degli eventi.
const SHOWCASE = ['assenza', 'video', 'sostituto', 'gita'].map(id => DEFAULT_BONUS.find(e => e.id === id)).filter(Boolean)
  .concat(DEFAULT_MALUS.slice(0, 3)) as typeof DEFAULT_BONUS;

export function Landing() {
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
            <Link to="/hof" className="btn btn-lg">Classifica</Link>
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

      <section style={{ marginTop: 46 }}>
        <h2>Come funziona</h2>
        <div className="steps" style={{ marginTop: 14 }}>
          <div className="step"><h3>Fai la lega</h3><p className="muted">Crea una lega per la tua classe e condividi il codice a sei caratteri con i compagni.</p></div>
          <div className="step"><h3>Scegli 4 prof</h3><p className="muted">Hai 50 crediti: ogni professore ha un costo. Il capitano vale doppio.</p></div>
          <div className="step"><h3>Scala la classifica</h3><p className="muted">L'admin registra gli eventi in classe e i punti arrivano subito. Compra, vendi e scambia prof nel mercato.</p></div>
        </div>
      </section>
    </main>
  );
}
