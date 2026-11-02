import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Loading } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import { joinLeague } from '@/lib/api';
import { explain } from '@/lib/errors';

/** /unisciti/:code — entra nella lega con il codice d'invito e porta alla sua classifica. */
export function JoinLeague() {
  const { code = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [error, setError] = useState('');
  const started = useRef(false);

  const clean = code.trim().toUpperCase();
  const valid = /^[A-Z0-9]{6}$/.test(clean);

  useEffect(() => {
    if (started.current || !valid) return;
    started.current = true;   // StrictMode monta due volte: l'iscrizione parte una sola volta
    joinLeague(clean)
      .then(id => { toast.ok('Sei dentro la lega!'); nav(`/leghe/${id}`, { replace: true }); })
      .catch(e => setError(explain(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clean, valid]);

  if (!valid || error) {
    return (
      <main className="page center" style={{ maxWidth: 460 }}>
        <h1 style={{ fontSize: '2.6rem' }}>Invito non valido</h1>
        <p className="muted">{error || 'Il codice d\'invito deve avere 6 caratteri tra lettere e numeri. Chiedi all\'admin di rimandarti il link.'}</p>
        <div className="row row-wrap" style={{ justifyContent: 'center', marginTop: 16 }}>
          <Link to="/" className="btn btn-primary">Vai alla home</Link>
          <Button onClick={() => { started.current = false; setError(''); nav(0); }}>Riprova</Button>
        </div>
      </main>
    );
  }
  return <main className="page"><p className="muted center">Ti sto aggiungendo alla lega…</p><Loading rows={1} /></main>;
}
