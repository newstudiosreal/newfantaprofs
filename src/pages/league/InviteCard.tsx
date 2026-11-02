import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import { qrSvg } from '@/lib/qr';

/** Link e QR code d'invito alla lega: `${origin}/unisciti/CODICE`. */
export function InviteCard({ code, leagueName }: { code: string; leagueName: string }) {
  const toast = useToast();
  const link = `${window.location.origin}/unisciti/${code}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [qrFailed, setQrFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    void qrSvg(link).then(s => { if (!alive) return; if (s) setSvg(s); else setQrFailed(true); });
    return () => { alive = false; };
  }, [link]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast.ok('Link copiato'); }
    catch { toast.error('Non riesco a copiare: seleziona il link e copialo a mano.'); }
  };
  const share = async () => {
    try { await navigator.share({ title: `Entra in ${leagueName} su FantaProf`, text: `Unisciti alla lega "${leagueName}" su FantaProf!`, url: link }); }
    catch { /* annullato dall'utente */ }
  };

  return (
    <div className="card">
      <p className="muted small" style={{ marginTop: 0 }}>Chi apre il link entra direttamente nella lega (dopo aver fatto accesso o essersi registrato). Il codice a 6 caratteri funziona sempre: <b className="code">{code}</b>.</p>
      <div className="invite">
        <div>
          <input className="input" readOnly value={link} aria-label="Link d'invito" onFocus={e => e.currentTarget.select()} />
          <div className="row row-wrap" style={{ marginTop: 10 }}>
            <Button variant="primary" size="sm" onClick={copy}>Copia link</Button>
            {typeof navigator.share === 'function' && <Button size="sm" onClick={share}>Condividi…</Button>}
          </div>
        </div>
        {svg && <div className="invite-qr" role="img" aria-label={`QR code per entrare in ${leagueName}`} dangerouslySetInnerHTML={{ __html: svg }} />}
        {!svg && !qrFailed && <div className="invite-qr muted tiny">QR…</div>}
      </div>
    </div>
  );
}
