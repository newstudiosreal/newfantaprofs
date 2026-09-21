import { useState } from 'react';
import { Empty } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { listEntitlements } from '@/lib/api';
import { applySkin, getSavedSkin, saveSkin, SKINS } from '@/lib/premium';
import { useLeague } from './context';

export function ProPage() {
  const { bundle, meId } = useLeague();
  const leagueId = bundle.league.id;
  const ents = useAsync(() => listEntitlements(meId), [meId]);
  const [active, setActive] = useState(getSavedSkin(leagueId));
  const owned = new Set(['default', ...(ents.data ?? []).filter(e => e.kind === 'skin').map(e => e.ref)]);

  return (
    <>
      <div className="card"><h3>⚡ Lega Pro</h3><p className="muted" style={{ margin: 0 }}>Questa lega è Pro: puoi personalizzarne i colori con le skin che possiedi. La skin la vedi solo tu.</p></div>
      <div className="section-title"><h2>Skin lega</h2></div>
      <div className="grid grid-3">
        {SKINS.map(s => {
          const has = owned.has(s.id);
          return (
            <button key={s.id} className="card" disabled={!has} onClick={() => { saveSkin(leagueId, s.id); applySkin(s.id); setActive(s.id); }}
              style={{ textAlign: 'left', cursor: has ? 'pointer' : 'not-allowed', opacity: has ? 1 : .5, borderColor: active === s.id ? s.color : undefined, borderWidth: 2 }}>
              <div className="row"><span style={{ width: 22, height: 22, borderRadius: 6, background: s.color }} /><b>{s.emoji} {s.name}</b></div>
              <div className="tiny muted" style={{ marginTop: 6 }}>{active === s.id ? 'In uso' : has ? 'Tocca per usarla' : 'Sblocca con un codice premium'}</div>
            </button>
          );
        })}
      </div>
      {!ents.data?.some(e => e.kind === 'skin') && <div style={{ marginTop: 12 }}><Empty title="Nessuna skin sbloccata">Riscatta un codice dal tuo profilo.</Empty></div>}
    </>
  );
}
