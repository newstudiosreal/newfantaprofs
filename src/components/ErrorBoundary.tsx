import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportClientError } from '@/lib/api.social';

interface State { error: Error | null; reported: 'no' | 'sending' | 'sent' | 'failed' }

/** Rete di sicurezza: invece della schermata vuota mostra un messaggio chiaro con Ricarica e Segnala. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, reported: 'no' };

  static getDerivedStateFromError(error: Error): Partial<State> { return { error, reported: 'no' }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Errore non gestito', error, info.componentStack);
  }

  private report = async () => {
    const { error } = this.state;
    if (!error) return;
    this.setState({ reported: 'sending' });
    try {
      await reportClientError(error.message || String(error), error.stack ?? null, window.location.pathname + window.location.search);
      this.setState({ reported: 'sent' });
    } catch { this.setState({ reported: 'failed' }); }
  };

  render() {
    const { error, reported } = this.state;
    if (!error) return this.props.children;
    return (
      <main className="err-box" role="alert">
        <h1>Ops, qualcosa si è rotto</h1>
        <p className="muted">Non è colpa tua. Prova a ricaricare la pagina: di solito basta. Se succede ancora, segnalaci il problema e lo sistemiamo.</p>
        <div className="row row-wrap" style={{ justifyContent: 'center', marginTop: 16 }}>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Ricarica</button>
          <a className="btn" href="/">Torna alla home</a>
          <button type="button" className="btn" disabled={reported === 'sending' || reported === 'sent'} onClick={() => void this.report()}>
            {reported === 'sent' ? '✓ Segnalato, grazie' : reported === 'sending' ? 'Invio…' : 'Segnala il problema'}
          </button>
        </div>
        {reported === 'failed' && <p className="muted small" style={{ marginTop: 10 }}>Non sono riuscito a inviare la segnalazione (serve essere connessi e aver fatto accesso).</p>}
      </main>
    );
  }
}
