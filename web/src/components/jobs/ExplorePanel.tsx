import { useRef } from 'react';
import type { RoleCategory } from '../../api/types.ts';
import type { RoleGroup } from '../../design/roleGroups.ts';
import { FilterPanel } from '../filters/FilterPanel.tsx';
import { FilterChips } from '../search/FilterChips.tsx';
import { SearchBar } from '../search/SearchBar.tsx';
import { FactLine } from './FactLine.tsx';
import { JobList } from './JobList.tsx';

interface Props {
  onOpen: (id: number, el: HTMLElement) => void;
  fam: RoleGroup | null;
  famRoles: RoleCategory[] | null;
  onFam: (g: RoleGroup | null) => void;
  /** The panel scrolls itself (desktop). On phones the page scrolls instead. */
  ownScroll: boolean;
}

/**
 * The side panel: headline and meta line, the natural-language search and chips (fixed at the top), then the filters
 * disclosure and the job list in one scroll area.
 */
export function ExplorePanel({ onOpen, fam, famRoles, onFam, ownScroll }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  return (
    <>
      <div className="mp-sh">
        <h1>
          Fresher jobs,
          <br />
          <em className="serif g">mapped.</em>
        </h1>
        <FactLine />
        <SearchBar />
        <FilterChips fam={fam} onClearFam={() => onFam(null)} />
      </div>
      <div ref={scroller} className="mp-scroll">
        <FilterPanel fam={fam} onFam={onFam} />
        <JobList onOpen={onOpen} scrollRef={ownScroll ? scroller : null} fam={fam} famRoles={famRoles} />
      </div>
    </>
  );
}
