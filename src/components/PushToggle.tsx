import { useEffect, useState } from 'react';
import { ActionButton } from '@/components/ui';
import { disablePush, enablePush, getPushState, type PushState } from '@/lib/push';

const HELP: Partial<Record<PushState, string>> = {
  unsupported: 'Questo browser non supporta le notifiche push. Su iPhone installa prima l\'app sulla schermata Home.',
  unconfigured: 'Le notifiche push non sono ancora attive su questo sito.',
  denied: 'Hai bloccato le notifiche per questo sito: riattivale dalle impostazioni del browser.',
};

/** Interruttore "Notifiche push" per il Profilo. */
export function PushToggle() {
  const [state, setState] = useState<PushState | null>(null);
  useEffect(() => { void getPushState().then(setState); }, []);
  if (!state) return null;
  const usable = state === 'on' || state === 'off';
  return (
    <div className="card">
      <div className="row between row-wrap">
        <span><b>Notifiche push</b><span className="muted small" style={{ display: 'block' }}>Scambi, aste, proposte e sfide anche quando l'app è chiusa.</span></span>
        {usable && (
          <ActionButton variant={state === 'on' ? 'default' : 'primary'} aria-pressed={state === 'on'}
            okMessage={state === 'on' ? 'Notifiche push disattivate' : 'Notifiche push attivate'}
            onAction={async () => { setState(state === 'on' ? await disablePush() : await enablePush()); }}>
            {state === 'on' ? 'Disattiva' : 'Attiva'}
          </ActionButton>
        )}
      </div>
      {HELP[state] && <p className="hint">{HELP[state]}</p>}
    </div>
  );
}
