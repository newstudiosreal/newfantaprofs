export function WatchStar({ on, onToggle, name }: { on: boolean; onToggle: () => void; name: string }) {
  return (
    <button type="button" className="star" aria-pressed={on} aria-label={on ? `Togli ${name} dai preferiti` : `Aggiungi ${name} ai preferiti`}
      title={on ? 'Nei preferiti' : 'Aggiungi ai preferiti'} onClick={e => { e.preventDefault(); e.stopPropagation(); onToggle(); }}>{on ? '★' : '☆'}</button>
  );
}
