import { linePath } from '@/lib/game';

export function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return <p className="muted small">Servono almeno due eventi per mostrare l'andamento.</p>;
  const min = Math.min(...values); const max = Math.max(...values);
  return (
    <svg className="spark" viewBox="0 0 300 56" preserveAspectRatio="none" role="img" aria-label={`${label}: da ${values[0]} a ${values[values.length - 1]} punti`}>
      <path d={linePath(values, 300, 56, min, max, 4)} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
