import { useState } from 'react';
import { ActionButton, Button, ConfirmModal } from '@/components/ui';
import { closeSeason, setSeasonAuto } from '@/lib/api.account';
import { resetLeague } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { seasonInfo } from '@/lib/season';
import type { League } from '@/lib/types';

/**
 * Impostazioni di stagione per la scheda Gestione.
 * `canClose`: owner o superadmin (può anche azzerare in anticipo); i co-admin possono cambiare modalità e chiudere a stagione finita.
 */
export function SeasonSettings({ league, reload, canClose }: { league: League; reload: () => Promise<unknown> | void; canClose: boolean }) {
  const [confirm, setConfirm] = useState<'close' | 'reset' | null>(null);
  const info = seasonInfo(league.season_start, league.season_num);
  const auto = league.auto_season_end;
  const state = info.state === 'active' ? `In corso: ${info.left} giorni alla fine` : info.state === 'pause'
    ? `Pausa: la stagione ${info.num} parte il ${fmtDate(league.season_start)}` : 'Finita: in attesa di chiusura';

  return (
    <>
      <div className="section-title"><h2>Stagione {info.num}</h2></div>
      <div className="card stack">
        <div className="row between row-wrap"><span className="small">{state}</span>
          <span className="badge">{auto ? 'Chiusura automatica' : 'Chiusura manuale'}</span></div>

        <div className="row between row-wrap" style={{ gap: 12 }}>
          <span className="small" style={{ flex: 1, minWidth: 220 }}>
            <b>Chiusura automatica</b><br />
            <span className="muted">{auto
              ? 'Scaduti i 30 giorni la stagione si chiude da sola: classifica archiviata, punti azzerati e squadre svuotate.'
              : 'Scaduti i 30 giorni non succede nulla finché un admin non preme "Chiudi stagione".'}</span>
          </span>
          <ActionButton size="sm" okMessage={auto ? 'Ora la chiusura è manuale' : 'Ora la chiusura è automatica'}
            onAction={async () => { await setSeasonAuto(league.id, !auto); await reload(); }}>
            {auto ? 'Passa a manuale' : 'Passa ad automatica'}
          </ActionButton>
        </div>

        <p className="hint" style={{ margin: 0 }}>
          Alla chiusura: la classifica va nello storico (tab Stagioni), eventi, mercato, scambi e pronostici si azzerano e ogni squadra
          perde i professori ma tiene nome, effetti e acquisti premium. Dopo 3 giorni di pausa parte la stagione successiva.
        </p>

        {info.state === 'ended' && !auto && (
          <Button variant="primary" onClick={() => setConfirm('close')}>Chiudi stagione {info.num}</Button>
        )}
        {info.state === 'ended' && auto && <p className="small muted" style={{ margin: 0 }}>La chiusura scatterà alla prossima apertura della lega.</p>}
        {canClose && <div><Button variant="danger" size="sm" onClick={() => setConfirm('reset')}>Azzera in anticipo</Button></div>}
      </div>

      {confirm === 'close' && <ConfirmModal title={`Chiudere la stagione ${info.num}?`} confirmLabel="Chiudi stagione"
        text="Archivia la classifica finale e azzera punti, mercato e squadre. Non si può annullare." danger
        onConfirm={async () => { await closeSeason(league.id); await reload(); }} onClose={() => setConfirm(null)} />}
      {confirm === 'reset' && <ConfirmModal title="Azzerare in anticipo?" confirmLabel="Azzera ora" danger
        text="Chiude subito la stagione in corso: la classifica attuale viene archiviata come finale, tutti ripartono da zero e la nuova stagione inizia adesso. Non si può annullare."
        onConfirm={async () => { await resetLeague(league.id); await reload(); }} onClose={() => setConfirm(null)} />}
    </>
  );
}
