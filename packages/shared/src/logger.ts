type Level = 'debug' | 'info' | 'warn' | 'error';
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const min = order[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? 20;

export function createLogger(scope: string) {
  const log = (level: Level, msg: string, meta?: unknown) => {
    if (order[level] < min) return;
    const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${msg}`;
    const out = level === 'error' || level === 'warn' ? console.error : console.log;
    meta === undefined ? out(line) : out(line, meta);
  };
  return {
    debug: (m: string, x?: unknown) => log('debug', m, x),
    info: (m: string, x?: unknown) => log('info', m, x),
    warn: (m: string, x?: unknown) => log('warn', m, x),
    error: (m: string, x?: unknown) => log('error', m, x),
  };
}
export type Logger = ReturnType<typeof createLogger>;
