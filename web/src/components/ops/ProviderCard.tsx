import { useEffect, useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import type { AiStatus, Provider, ProviderInput, ProviderStatus, TestResult } from '../../api/types.ts';
import { ConfirmDialog } from './Feedback.tsx';
import { aiModeLine, formatDuration } from './format.ts';
import { opsApi } from './opsApi.ts';
import { ErrorBlock, Spinner } from './States.tsx';
import { StatusLabel } from './StatusLabel.tsx';

type FieldKey = keyof ProviderInput;
interface FieldDef {
  key: FieldKey;
  label: string;
  type: 'secret' | 'text' | 'url';
  placeholder?: string;
  hint?: string;
}

const DEFS: Record<Provider, { eyebrow: string; title: string; does: string; fields: FieldDef[] }> = {
  jev: {
    eyebrow: '01 · First pass',
    title: 'Jev (TypeSafe AI)',
    does:
      'Jev answers typed questions about every post the rules could not settle: role, job type, work mode, whether it is for freshers, and the city when the rules are unsure. It is fast and cheap, so it sees most posts first.',
    fields: [
      { key: 'apiKey', label: 'API key', type: 'secret' },
      { key: 'model', label: 'Model', type: 'text', placeholder: 'jev-latest', hint: 'Leave as jev-latest unless TypeSafe AI gave you another model name.' },
    ],
  },
  llm: {
    eyebrow: '02 · Second pass',
    title: 'LLM (Azure AI Foundry)',
    does:
      'The LLM reads the full text when Jev is unsure or a free value is missing: stipend amounts, skills and every city of a multi-city post. It also parses searches typed in plain words.',
    fields: [
      { key: 'endpoint', label: 'Endpoint', type: 'url', placeholder: 'https://YOUR-RESOURCE.openai.azure.com…' },
      { key: 'apiKey', label: 'API key', type: 'secret' },
      { key: 'deployment', label: 'Deployment name', type: 'text', placeholder: 'The name you gave the model deployment' },
      { key: 'apiVersion', label: 'API version', type: 'text', placeholder: '2025-04-01-preview' },
    ],
  },
};

const SOURCE_LABEL: Record<ProviderStatus['source'], string> = { db: 'Saved in the app', env: 'From .env', none: 'Not set' };

function initialValues(st: ProviderStatus | undefined): ProviderInput {
  return {
    apiKey: '',
    model: st?.model ?? '',
    endpoint: st?.endpoint ?? '',
    deployment: st?.deployment ?? '',
    apiVersion: st?.apiVersion ?? '',
  };
}

/** Only the fields this provider takes, and only non-empty ones (the API rejects empty strings). */
function payload(p: Provider, v: ProviderInput): ProviderInput {
  const out: ProviderInput = {};
  for (const f of DEFS[p].fields) {
    const val = v[f.key]?.trim();
    if (val) out[f.key] = val;
  }
  return out;
}

export function ProviderCard({ provider, status, onSaved }: { provider: Provider; status: ProviderStatus; onSaved: (msg: string) => void }) {
  const qc = useQueryClient();
  const def = DEFS[provider];
  const uid = useId();
  const [values, setValues] = useState<ProviderInput>(() => initialValues(status));
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [confirm, setConfirm] = useState(false);

  // when the saved status changes (save, remove), refill the non-secret fields from it
  useEffect(() => {
    setValues((v) => ({ ...initialValues(status), apiKey: v.apiKey }));
  }, [status.model, status.endpoint, status.deployment, status.apiVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (s: AiStatus) => {
    qc.setQueryData(['ops', 'aiStatus'], s);
    qc.setQueryData(['aiStatus'], s);
  };

  const testM = useMutation({
    mutationFn: () => opsApi.testProvider(provider, payload(provider, values)),
    onMutate: () => setTest(null),
    onSuccess: setTest,
  });
  const saveM = useMutation({
    mutationFn: () => opsApi.saveProvider(provider, payload(provider, values)),
    onSuccess: (s) => {
      apply(s);
      setValues((v) => ({ ...v, apiKey: '' }));
      onSaved(`${def.title} settings saved. Tagging mode: ${aiModeLine(s.mode)}`);
    },
  });
  const removeM = useMutation({
    mutationFn: () => opsApi.removeProvider(provider),
    onSuccess: (s) => {
      apply(s);
      setConfirm(false);
      setTest(null);
      onSaved(`Saved ${def.title} key removed. Tagging mode: ${aiModeLine(s.mode)}`);
    },
  });

  const toSave = payload(provider, values);
  const changed = Object.entries(toSave).some(([k, v]) => k === 'apiKey' || v !== (status[k as keyof ProviderStatus] ?? ''));
  const opError = saveM.error ?? testM.error ?? removeM.error;

  return (
    <section className="card ops-provider" aria-labelledby={`${uid}-h`}>
      <div className="ops-provider__head">
        <div>
          <span className="eb">{def.eyebrow}</span>
          <h2 id={`${uid}-h`}>{def.title}</h2>
        </div>
        <StatusLabel tone={status.configured ? 'ok' : 'neutral'}>{status.configured ? 'Key active' : 'No key'}</StatusLabel>
      </div>
      <p className="ops-provider__does">{def.does}</p>

      <dl className="ops-provider__key">
        <dt>Active key</dt>
        <dd>{status.maskedKey ? <span className="mono">{status.maskedKey}</span> : 'None'}</dd>
        <dt>Comes from</dt>
        <dd>{SOURCE_LABEL[status.source]}</dd>
      </dl>

      <form
        className="ops-provider__fields"
        onSubmit={(e) => {
          e.preventDefault();
          if (changed) saveM.mutate();
        }}
        noValidate
      >
        {def.fields.map((f) => {
          const id = `${uid}-${f.key}`;
          const hintId = `${id}-hint`;
          const hint = f.type === 'secret' ? (status.configured ? 'Leave empty to keep the active key.' : 'Paste the key. It is stored encrypted and shown masked.') : f.hint;
          return (
            <div className="field" key={f.key}>
              <label htmlFor={id}>{f.label}</label>
              {f.type === 'secret' ? (
                <div className="ops-secret">
                  <input
                    id={id}
                    name={`${provider}-${f.key}`}
                    type={showKey ? 'text' : 'password'}
                    value={values[f.key] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    autoComplete="off"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    data-1p-ignore
                    data-lpignore="true"
                    placeholder={status.maskedKey ?? 'Paste your key'}
                    aria-describedby={hint ? hintId : undefined}
                  />
                  <button
                    type="button"
                    className="ops-secret__toggle"
                    onClick={() => setShowKey((s) => !s)}
                    aria-pressed={showKey}
                    aria-label={showKey ? `Hide ${f.label}` : `Show ${f.label}`}
                  >
                    {showKey ? 'Hide' : 'Show'}
                  </button>
                </div>
              ) : (
                <input
                  id={id}
                  name={`${provider}-${f.key}`}
                  type={f.type === 'url' ? 'url' : 'text'}
                  inputMode={f.type === 'url' ? 'url' : undefined}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  autoComplete="off"
                  spellCheck={false}
                  autoCapitalize="off"
                  aria-describedby={hint ? hintId : undefined}
                />
              )}
              {hint && (
                <span className="ops-hint" id={hintId}>
                  {hint}
                </span>
              )}
            </div>
          );
        })}

        <div className="ops-provider__actions">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => testM.mutate()}
            disabled={testM.isPending}
            aria-busy={testM.isPending}
          >
            {testM.isPending && <Spinner />}
            Test connection
          </button>
          <button type="submit" className="btn btn--primary" disabled={!changed || saveM.isPending} aria-busy={saveM.isPending}>
            {saveM.isPending && <Spinner />}
            Save
          </button>
          {status.source === 'db' && (
            <button type="button" className="ops-provider__remove" onClick={() => setConfirm(true)}>
              Remove saved key
            </button>
          )}
        </div>
        <p className="ops-hint">Test connection makes one small real call with the values above (or the active key when the key field is empty). It saves nothing.</p>
      </form>

      <div aria-live="polite">
        {test &&
          (test.ok ? (
            <div className="ops-test ops-test--ok">
              <p className="ops-test__title">
                <Check size={18} aria-hidden="true" />
                Connected in {formatDuration(test.latencyMs)}
                {test.model && (
                  <>
                    {' '}
                    · model <span className="mono">{test.model}</span>
                  </>
                )}
              </p>
            </div>
          ) : (
            <div className="ops-test ops-test--fail">
              <p className="ops-test__title">
                <X size={18} aria-hidden="true" />
                {test.latencyMs > 0 ? `Connection failed after ${formatDuration(test.latencyMs)}` : 'Connection not tried'}
              </p>
              <pre>{test.error ?? 'No error text returned.'}</pre>
            </div>
          ))}
      </div>
      {opError != null && <ErrorBlock error={opError} compact />}

      <ConfirmDialog
        open={confirm}
        title={`Remove the saved ${def.title} key?`}
        confirmLabel="Remove key"
        busy={removeM.isPending}
        onCancel={() => setConfirm(false)}
        onConfirm={() => removeM.mutate()}
      >
        <p>The pipeline stops using it from the next run. If .env also holds a key for this provider, the app falls back to that one.</p>
      </ConfirmDialog>
    </section>
  );
}
