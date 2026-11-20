import { closePool, createLogger, env } from '@beep/shared';
import { createApp } from './app.ts';

const log = createLogger('api');
const app = createApp();

const server = app.listen(env.app.apiPort, () => {
  log.info(`listening on http://localhost:${env.app.apiPort} (CORS origin ${env.app.webOrigin}, admin token ${env.app.adminToken ? 'required' : 'off'})`);
});

const shutdown = () => {
  server.close(() => closePool().finally(() => process.exit(0)));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
