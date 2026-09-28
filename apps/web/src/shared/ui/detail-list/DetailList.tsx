import type { ReactNode } from 'react';

/*
 * Term/value pairs rendered as a description list:
 *
 *   <DetailList className="token-market-stats">
 *     <DetailListItem term="Price">$0.069</DetailListItem>
 *   </DetailList>
 */

export function DetailList({ className, children }: { className?: string; children: ReactNode }) {
  return <dl className={className}>{children}</dl>;
}

export function DetailListItem({ term, children }: { term: ReactNode; children: ReactNode }) {
  return (
    <div>
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}
