import { CITIES } from '../cities.ts';
import { closePool, exec } from '../db.ts';
import { createLogger } from '../logger.ts';

const log = createLogger('seed-cities');

async function main() {
  for (const c of CITIES) {
    await exec(
      `MERGE cities AS t USING (SELECT @name AS name) AS s ON t.name = s.name
       WHEN MATCHED THEN UPDATE SET state=@state, lat=@lat, lng=@lng, aliases=@aliases, tier=@tier
       WHEN NOT MATCHED THEN INSERT (name, state, lat, lng, aliases, tier) VALUES (@name, @state, @lat, @lng, @aliases, @tier);`,
      { name: c.name, state: c.state, lat: c.lat, lng: c.lng, aliases: JSON.stringify(c.aliases), tier: c.tier },
    );
  }
  log.info(`seeded ${CITIES.length} cities`);
}

main()
  .catch((e) => {
    log.error('seed failed', e);
    process.exitCode = 1;
  })
  .finally(closePool);
