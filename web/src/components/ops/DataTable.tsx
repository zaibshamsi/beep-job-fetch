import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown, ChevronRight } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** Makes the column sortable. */
  sortValue?: (row: T) => number | string | null | undefined;
  align?: 'left' | 'right';
  /** JetBrains Mono, tabular: counts, IDs, timings. */
  mono?: boolean;
  /** Keep the cell on one line. */
  nowrap?: boolean;
}

type Sort = { key: string; dir: 'asc' | 'desc' } | null;

/**
 * A dense table that scrolls sideways inside its own frame on a narrow screen (the page never does).
 * Optional sorting (click a header) and an expandable detail row per line.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  initialSort = null,
  expand,
  expandLabel = (_row: T) => 'Show details',
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  caption: string;
  initialSort?: Sort;
  expand?: (row: T) => ReactNode | null;
  expandLabel?: (row: T) => string;
}) {
  const [sort, setSort] = useState<Sort>(initialSort);
  const [open, setOpen] = useState<Set<string | number>>(() => new Set());

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    const mul = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mul;
      return String(va).localeCompare(String(vb), 'en-IN', { numeric: true }) * mul;
    });
  }, [rows, sort, columns]);

  const toggleSort = (key: string, align?: 'left' | 'right') =>
    setSort((s) => {
      if (s?.key !== key) return { key, dir: align === 'right' ? 'desc' : 'asc' };
      return { key, dir: s.dir === 'asc' ? 'desc' : 'asc' };
    });

  const span = columns.length + (expand ? 1 : 0);

  return (
    <div className="ops-table-wrap" tabIndex={0} role="region" aria-label={caption}>
      <table className="ops-table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {expand && (
              <th scope="col" className="ops-table__exp">
                <span className="visually-hidden">Details</span>
              </th>
            )}
            {columns.map((c) => {
              const active = sort?.key === c.key;
              const ariaSort = active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={c.sortValue ? (ariaSort ?? 'none') : undefined}
                  className={c.align === 'right' ? 'is-right' : undefined}
                >
                  {c.sortValue ? (
                    <button type="button" className="ops-table__sort" onClick={() => toggleSort(c.key, c.align)}>
                      {c.header}
                      {active ? (
                        sort!.dir === 'asc' ? (
                          <ChevronUp size={14} aria-hidden="true" />
                        ) : (
                          <ChevronDown size={14} aria-hidden="true" />
                        )
                      ) : (
                        <ChevronsUpDown size={14} aria-hidden="true" className="ops-table__sort-idle" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const k = rowKey(row);
            const detail = expand?.(row) ?? null;
            const isOpen = open.has(k);
            const detailId = `ops-row-${String(k).replace(/[^a-z0-9_-]/gi, '')}`;
            return (
              <Fragment key={k}>
                <tr className={isOpen ? 'is-open' : undefined}>
                  {expand && (
                    <td className="ops-table__exp">
                      {detail && (
                        <button
                          type="button"
                          className="ops-icon-btn"
                          aria-expanded={isOpen}
                          aria-controls={detailId}
                          aria-label={expandLabel(row)}
                          onClick={() =>
                            setOpen((s) => {
                              const n = new Set(s);
                              if (n.has(k)) n.delete(k);
                              else n.add(k);
                              return n;
                            })
                          }
                        >
                          <ChevronRight size={16} aria-hidden="true" className="ops-chev" />
                        </button>
                      )}
                    </td>
                  )}
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={[c.align === 'right' && 'is-right', c.mono && 'num mono', c.nowrap && 'is-nowrap']
                        .filter(Boolean)
                        .join(' ') || undefined}
                    >
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
                {detail && isOpen && (
                  <tr className="ops-table__detail" id={detailId}>
                    <td colSpan={span}>{detail}</td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
