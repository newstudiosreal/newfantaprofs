import { useEffect, useState } from 'react';
import { ActionButton } from '@/components/ui';
import { followStats, toggleFollow } from '@/lib/api.social';

/** Segui / Smetti di seguire. Se `initial` manca, legge lo stato dal server. */
export function FollowButton({ userId, initial, size = 'sm', onChange }:
  { userId: string; initial?: boolean; size?: 'sm' | 'lg'; onChange?: (following: boolean) => void }) {
  const [on, setOn] = useState<boolean | undefined>(initial);
  useEffect(() => { setOn(initial); }, [initial, userId]);
  useEffect(() => {
    if (initial !== undefined) return;
    let alive = true;
    followStats(userId).then(s => { if (alive) setOn(s.i_follow); }).catch(() => { if (alive) setOn(false); });
    return () => { alive = false; };
  }, [userId, initial]);

  return (
    <ActionButton size={size} variant={on ? 'default' : 'primary'} disabled={on === undefined} aria-pressed={!!on}
      okMessage={on ? 'Non lo segui più' : 'Ora lo segui'}
      onAction={async () => { const now = await toggleFollow(userId); setOn(now); onChange?.(now); }}>
      {on ? '✓ Seguito' : '+ Segui'}
    </ActionButton>
  );
}

/** "12 seguiti · 5 follower" di un utente. */
export function FollowCounts({ userId }: { userId: string }) {
  const [s, setS] = useState<{ following: number; followers: number } | null>(null);
  useEffect(() => {
    let alive = true;
    followStats(userId).then(r => { if (alive) setS(r); }).catch(() => undefined);
    return () => { alive = false; };
  }, [userId]);
  if (!s) return null;
  return <p className="muted small" style={{ margin: '8px 0 0' }}>{s.following} seguiti · {s.followers} follower</p>;
}
