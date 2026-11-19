const EDGE_LAYERS = 11;

/** Moneta 3D in solo CSS: due facce e un bordo fatto di dischi impilati. La rotazione si controlla da CSS (.tk-coin). */
export function TokenCoin({ spinning = true }: { spinning?: boolean }) {
  return (
    <div className={`tk-coin ${spinning ? 'is-spinning' : ''}`} aria-hidden="true">
      {Array.from({ length: EDGE_LAYERS }, (_, i) => (
        <span key={i} className="tk-coin-edge" style={{ ['--z' as string]: `${(i - (EDGE_LAYERS - 1) / 2) * 1.1}px` }} />
      ))}
      <span className="tk-coin-face tk-coin-front">
        <span className="tk-coin-ring" />
        <span className="tk-coin-mark">FP</span>
        <span className="tk-coin-word">TOKEN</span>
        <span className="tk-coin-shine" />
      </span>
      <span className="tk-coin-face tk-coin-back">
        <span className="tk-coin-ring" />
        <i className="tk-coin-logo" />
        <span className="tk-coin-word">FANTAPROF</span>
        <span className="tk-coin-shine" />
      </span>
    </div>
  );
}
