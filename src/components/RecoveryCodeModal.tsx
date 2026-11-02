import { useState } from 'react';
import { Button, Modal } from '@/components/ui';
import { useToast } from '@/hooks/useToast';

/** Mostra un codice di recupero una sola volta; si chiude solo dopo la conferma "L'ho salvato". */
export function RecoveryCodeModal({ code, title = 'Salva il tuo codice di recupero', onDone }:
  { code: string; title?: string; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const toast = useToast();
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); toast.ok('Codice copiato'); } catch { toast.error('Copia non riuscita: selezionalo e copialo a mano.'); }
  };
  return (
    <Modal title={title} onClose={() => { if (saved) onDone(); }}>
      <p className="muted small">
        Se dimentichi la password, questo codice è l'<b>unico modo</b> per rientrare senza chiedere a un admin.
        Non verrà mostrato di nuovo: scrivilo o salvalo in un posto sicuro.
      </p>
      <div className="card-flat center" style={{ margin: '14px 0' }}>
        <code className="code" style={{ fontSize: '1.6rem', letterSpacing: '.08em', userSelect: 'all' }}>{code}</code>
      </div>
      <Button block onClick={copy}>📋 Copia il codice</Button>
      <label className="row" style={{ margin: '14px 0', gap: 10, cursor: 'pointer' }}>
        <input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} style={{ width: 20, height: 20 }} />
        <span>L'ho salvato in un posto sicuro</span>
      </label>
      <Button variant="primary" block disabled={!saved} onClick={onDone}>Continua</Button>
    </Modal>
  );
}
