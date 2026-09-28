export function PairBadge({ pair }: { pair: { symbol: string; name: string } }) {
  return (
    <span className="pair-badge" title={`Paired against ${pair.name}`}>
      <span className="pair-badge-label">Paired</span>
      <span className="pair-badge-symbol">{pair.symbol}</span>
    </span>
  );
}
