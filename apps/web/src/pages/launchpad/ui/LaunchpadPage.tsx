import { useId, useState } from 'react';
import { TokenGrid } from '@/entities/token';
import { supportedNetwork } from '@/shared/config';
import { useMediaQuery } from '@/shared/lib';
import { Pagination, pageToMoveTo } from '@/shared/ui/pagination';
import {
  AGE_OPTIONS,
  COMPACT_LAYOUT,
  DEFAULT_AGE,
  DEFAULT_SORT,
  EAGER_CARD_COUNT,
  PAGE_SIZE,
  SORT_OPTIONS,
  type ExploreSort,
  type ListAge,
} from '../config/explore-filters';
import { useGridPage } from '../model/grid-page';
import { useExploreList, useGraduatedList, type TokenList } from '../model/token-lists';
import { ExploreSection, ExploreSectionHeader, ExploreSectionHeading } from './ExploreSection';
import { ExploreToolbar } from './ExploreToolbar';
import { FilterTabs } from './FilterTabs';
import './launchpad.css';

/** Each layout shows whole rows, so each asks the backend for its own page size. */
type Layout = 'wide' | 'compact';

export function LaunchpadPage() {
  const layout: Layout = useMediaQuery(COMPACT_LAYOUT) ? 'compact' : 'wide';

  return (
    <main className="bridge-main">
      <title>Explore · AI Launchpad</title>
      <div className="bridge-shell terminal-shell launchpad-explore-shell">
        <ExploreToolbar />
        <GraduatedGrid pageSize={PAGE_SIZE.graduated[layout]} />
        <ExploreGrid pageSize={PAGE_SIZE.explore[layout]} />
      </div>
    </main>
  );
}

function GridPagination({
  label,
  list,
  page,
  onPageChange,
}: {
  label: string;
  list: TokenList;
  page: number;
  onPageChange: (page: number) => void;
}) {
  if (list.grid.status !== 'ready' || list.pageCount === null) return null;
  return (
    <Pagination
      className="launch-explore-pagination"
      label={label}
      pageCount={list.pageCount}
      page={page}
      onPageChange={onPageChange}
    />
  );
}

function GraduatedGrid({ pageSize }: { pageSize: number }) {
  const titleId = useId();
  const [page, setPage] = useGridPage(String(pageSize));
  const list = useGraduatedList(page, pageSize);
  // Adjusting state while rendering, as React documents, so a page the list shrank past is left at once.
  const moveTo = pageToMoveTo(page, list.pageCount);
  if (moveTo !== null) setPage(moveTo);

  return (
    <ExploreSection titleId={titleId} className="launch-explore-graduated">
      <ExploreSectionHeader>
        <ExploreSectionHeading description="Tokens that cleared the graduation threshold.">
          <h2 id={titleId}>Graduated</h2>
          {list.count !== null && <span className="launch-explore-count">{list.count}</span>}
        </ExploreSectionHeading>
      </ExploreSectionHeader>
      <TokenGrid grid={list.grid} eagerCount={EAGER_CARD_COUNT.graduated} />
      <GridPagination label="Graduated token pages" list={list} page={page} onPageChange={setPage} />
    </ExploreSection>
  );
}

function ExploreGrid({ pageSize }: { pageSize: number }) {
  const titleId = useId();
  const [sort, setSort] = useState<ExploreSort>(DEFAULT_SORT);
  const [age, setAge] = useState<ListAge>(DEFAULT_AGE);
  const [page, setPage] = useGridPage(`${sort}:${age}:${pageSize}`);
  const list = useExploreList({ sort, age, page, pageSize });
  const moveTo = pageToMoveTo(page, list.pageCount);
  if (moveTo !== null) setPage(moveTo);

  return (
    <ExploreSection titleId={titleId}>
      <ExploreSectionHeader>
        <ExploreSectionHeading description={`Tokens still climbing toward graduation on ${supportedNetwork.name}.`}>
          <h1 id={titleId}>Explore</h1>
          {list.count !== null && (
            <span className="launch-explore-count" aria-label={`${list.count} tokens launched`}>
              {list.count} launched
            </span>
          )}
        </ExploreSectionHeading>
        <div className="launch-explore-filters">
          <FilterTabs label="Sort launches" options={SORT_OPTIONS} value={sort} onValueChange={setSort} />
          <FilterTabs label="Filter by age" options={AGE_OPTIONS} value={age} onValueChange={setAge} />
        </div>
      </ExploreSectionHeader>
      <TokenGrid grid={list.grid} eagerCount={EAGER_CARD_COUNT.explore} />
      <GridPagination label="Explore token pages" list={list} page={page} onPageChange={setPage} />
    </ExploreSection>
  );
}
