import { forwardRef, useId, type KeyboardEvent, type Ref } from 'react';
import { JOB_TYPE_LABEL, ROLE_CATEGORIES, type JobType } from '../../api/types.ts';
import type { AccuracyField } from './opsApi.ts';

export interface Draft {
  correct: boolean | null;
  correctValue: string;
}

export const FIELD_LABEL: Record<AccuracyField, string> = {
  role_category: 'Role',
  cities: 'Cities',
  job_type: 'Job type',
  is_fresher: 'For freshers',
};

/** One predicted field with Correct / Wrong and, when wrong, the right value. */
export const LabelRow = forwardRef<HTMLInputElement | HTMLSelectElement, {
  field: AccuracyField;
  index: number;
  shown: string;
  isEmpty: boolean;
  draft: Draft;
  /** For is_fresher the right value is simply the opposite, so there is nothing to type. */
  autoValueText?: string;
  onChange: (d: Draft) => void;
}>(function LabelRow({ field, index, shown, isEmpty, draft, autoValueText, onChange }, ref) {
  const id = useId();
  // Esc (or Enter in the text field) hands the keyboard back to the page shortcuts
  const backToKeys = (e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (e.key === 'Escape' || (e.key === 'Enter' && e.currentTarget.tagName === 'INPUT')) {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };
  const yesKey = index * 2 + 1;
  const noKey = index * 2 + 2;
  return (
    <div className="ops-fieldrow" role="group" aria-labelledby={`${id}-n`}>
      <span className="ops-fieldrow__name" id={`${id}-n`}>
        {FIELD_LABEL[field]}
      </span>
      <span className={`ops-fieldrow__value${isEmpty ? ' is-empty' : ''}`}>{shown}</span>
      <span className="ops-fieldrow__choice">
        <button
          type="button"
          className="ops-choice ops-choice--yes"
          aria-pressed={draft.correct === true}
          aria-keyshortcuts={String(yesKey)}
          onClick={() => onChange({ correct: true, correctValue: '' })}
        >
          Correct <kbd aria-hidden="true">{yesKey}</kbd>
        </button>
        <button
          type="button"
          className="ops-choice ops-choice--no"
          aria-pressed={draft.correct === false}
          aria-keyshortcuts={String(noKey)}
          onClick={() => onChange({ correct: false, correctValue: draft.correctValue })}
        >
          Wrong <kbd aria-hidden="true">{noKey}</kbd>
        </button>
      </span>
      {draft.correct === false && (
        <div className="ops-fieldrow__fix field">
          {field === 'is_fresher' ? (
            <span className="ops-hint">Right value: {autoValueText}</span>
          ) : (
            <>
              <label htmlFor={`${id}-fix`}>Right {FIELD_LABEL[field].toLowerCase()}</label>
              {field === 'role_category' ? (
                <select
                  id={`${id}-fix`}
                  ref={ref as Ref<HTMLSelectElement>}
                  value={draft.correctValue}
                  onChange={(e) => onChange({ correct: false, correctValue: e.target.value })}
                  onKeyDown={backToKeys}
                >
                  <option value="">Choose the right role</option>
                  {ROLE_CATEGORIES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              ) : field === 'job_type' ? (
                <select
                  id={`${id}-fix`}
                  ref={ref as Ref<HTMLSelectElement>}
                  value={draft.correctValue}
                  onChange={(e) => onChange({ correct: false, correctValue: e.target.value })}
                  onKeyDown={backToKeys}
                >
                  <option value="">Choose the right job type</option>
                  {(Object.keys(JOB_TYPE_LABEL) as JobType[]).map((t) => (
                    <option key={t} value={t}>
                      {JOB_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={`${id}-fix`}
                  ref={ref as Ref<HTMLInputElement>}
                  type="text"
                  value={draft.correctValue}
                  placeholder="Pune, Mumbai (or Remote)"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => onChange({ correct: false, correctValue: e.target.value })}
                  onKeyDown={backToKeys}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
});
