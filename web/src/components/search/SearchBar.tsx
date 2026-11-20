import { useMutation } from '@tanstack/react-query';
import { Sparkles, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../../api/client.ts';
import type { ParsedSearch } from '../../api/types.ts';
import { fromParsed } from '../../state/filters.ts';
import { Spinner } from '../jobs/states.tsx';
import { useExploreState } from '../jobs/useExploreState.ts';
import { PARSED_BY_LABEL } from './chips.ts';
import './search.css';

const DEBOUNCE_MS = 300;

/**
 * The natural-language search. Typing filters live by keywords (?q=, debounced 300 ms, history replaced); Enter sends
 * the text to POST /search/parse and turns it into filters plus a focus city (history pushed).
 */
export function SearchBar() {
  const { filters, focus, update } = useExploreState();
  const urlQ = filters.q ?? '';
  const [text, setText] = useState(urlQ);
  const [parsed, setParsed] = useState<{ by: ParsedSearch['parsedBy'] } | null>(null);
  const lastWritten = useRef<string>(urlQ);
  const timer = useRef<number | undefined>(undefined);
  const inputId = useId();
  const hintId = useId();

  // The URL changed from elsewhere (chip removed, parse applied, Back): show it in the input.
  useEffect(() => {
    if (urlQ !== lastWritten.current) {
      lastWritten.current = urlQ;
      setText(urlQ);
    }
  }, [urlQ]);

  const writeQ = (value: string) => {
    const q = value.trim();
    lastWritten.current = q;
    update({ filters: (f) => ({ ...f, q: q || undefined }) }, { replace: true });
  };

  const onChange = (value: string) => {
    setText(value);
    setParsed(null);
    if (parse.isError) parse.reset();
    window.clearTimeout(timer.current);
    if (value.trim() === urlQ) return;
    timer.current = window.setTimeout(() => writeQ(value), DEBOUNCE_MS);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const parse = useMutation({
    mutationFn: (query: string) => api.parseSearch(query),
    onSuccess: (res) => {
      const next = fromParsed(res.filters);
      // Keep the focused city only if the new search still includes it.
      const keepFocus = focus && (next.cities.length === 0 || next.cities.includes(focus)) ? focus : null;
      lastWritten.current = next.q ?? '';
      setText(next.q ?? '');
      setParsed({ by: res.parsedBy });
      update({ filters: next, params: { focus: res.focusCity ?? keepFocus, job: null } });
    },
    onError: (_err, query) => writeQ(query),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    window.clearTimeout(timer.current);
    const query = text.trim();
    if (!query) {
      if (urlQ) writeQ('');
      return;
    }
    if (query.length > 300) {
      writeQ(query);
      return;
    }
    parse.mutate(query);
  };

  const busy = parse.isPending;

  return (
    <>
      <form role="search" className="mp-search" onSubmit={onSubmit} aria-busy={busy || undefined}>
        <label htmlFor={inputId} className="visually-hidden">
          Search jobs
        </label>
        <Sparkles size={18} className="mp-search__ico" aria-hidden="true" />
        <input
          id={inputId}
          type="search"
          className="mp-search__input"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder={'Try “internships in Bengaluru with stipend”'}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          maxLength={300}
          aria-describedby={hintId}
        />
        {text && !busy && (
          <button
            type="button"
            className="mp-search__clear"
            aria-label="Clear search text"
            onClick={() => {
              onChange('');
              window.clearTimeout(timer.current);
              writeQ('');
            }}
          >
            <X size={15} aria-hidden="true" />
          </button>
        )}
        {busy ? <Spinner label="Reading your search" /> : <kbd aria-hidden="true">{'↵'}</kbd>}
      </form>
      <p id={hintId} className="mp-hint" aria-live="polite">
        {parse.isError ? (
          <span className="mp-hint__err">Could not read that search. Your words are used as keywords instead.</span>
        ) : parsed ? (
          <>
            <i aria-hidden="true" />
            {PARSED_BY_LABEL[parsed.by]}
          </>
        ) : (
          <span className="visually-hidden">Press Enter to turn a sentence into filters.</span>
        )}
      </p>
    </>
  );
}
