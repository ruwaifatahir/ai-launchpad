import type { ReactNode } from 'react';
import { cx } from '@/shared/lib';

/*
 * Building blocks for a launchpad section. The page composes them, so each section
 * decides its own heading level, count format and filters without boolean props:
 *
 *   <ExploreSection titleId={id}>
 *     <ExploreSectionHeader>
 *       <ExploreSectionHeading>...</ExploreSectionHeading>
 *       {filters}
 *     </ExploreSectionHeader>
 *     <TokenGrid grid={grid} />
 *     <Pagination ... />
 *   </ExploreSection>
 */

export function ExploreSection({
  titleId,
  className,
  children,
}: {
  titleId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cx('launch-explore', className, 'float')} aria-labelledby={titleId}>
      {children}
    </section>
  );
}

export function ExploreSectionHeader({ children }: { children: ReactNode }) {
  return <header className="launch-explore-section-head">{children}</header>;
}

/** Title row (heading + count) with a short description underneath. */
export function ExploreSectionHeading({ description, children }: { description: string; children: ReactNode }) {
  return (
    <div className="launch-explore-head-main">
      <div className="launch-explore-title-row">{children}</div>
      <p className="launch-explore-copy">{description}</p>
    </div>
  );
}
