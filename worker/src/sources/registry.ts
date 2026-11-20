import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { SourceAdapter } from '@beep/shared';
import { createLogger } from '@beep/shared';

const log = createLogger('registry');
const dir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Auto-discovers adapters. Any `*.ts` file in this folder (except registry.ts, index.ts, and files
 * starting with `_`) that exports `default` as a SourceAdapter or SourceAdapter[] is registered.
 * Adding a source = adding a file; no central list to edit.
 */
export async function loadAdapters(): Promise<SourceAdapter[]> {
  const files = (await readdir(dir)).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'registry.ts' && f !== 'index.ts' && !f.startsWith('_'),
  );
  const out: SourceAdapter[] = [];
  for (const f of files.sort()) {
    try {
      const mod = await import(pathToFileURL(path.join(dir, f)).href);
      const exp = mod.default;
      const list: SourceAdapter[] = Array.isArray(exp) ? exp : exp ? [exp] : [];
      for (const a of list) {
        if (a?.name && typeof a.fetch === 'function' && typeof a.normalize === 'function') out.push(a);
      }
    } catch (err) {
      log.error(`failed to load source file ${f}`, err);
    }
  }
  const names = new Set<string>();
  for (const a of out) {
    if (names.has(a.name)) throw new Error(`duplicate source name: ${a.name}`);
    names.add(a.name);
  }
  return out;
}
