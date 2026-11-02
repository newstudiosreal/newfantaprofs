import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';

interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
const KEY = 'fp_install_dismissed';

const readDismissed = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

/** Invito a installare l'app (PWA) sulla schermata Home. Si può nascondere per sempre. */
export function InstallPrompt() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [hidden, setHidden] = useState(readDismissed);

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    const onInstalled = () => setEvt(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);

  if (!evt || hidden) return null;
  const dismiss = () => { try { localStorage.setItem(KEY, '1'); } catch { /* ignora */ } setHidden(true); };
  return (
    <div className="install-prompt" role="region" aria-label="Installa l'app">
      <span className="small"><b>Installa FantaProf</b> sulla schermata Home: si apre più veloce e puoi ricevere le notifiche.</span>
      <span className="row">
        <Button size="sm" variant="primary" onClick={async () => { await evt.prompt(); const c = await evt.userChoice; setEvt(null); if (c.outcome === 'dismissed') dismiss(); }}>Installa</Button>
        <Button size="sm" variant="ghost" onClick={dismiss} aria-label="Non mostrare più">✕</Button>
      </span>
    </div>
  );
}
