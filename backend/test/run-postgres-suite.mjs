import { spawnSync } from 'node:child_process';

import { GenericContainer, Wait } from 'testcontainers';

const mode = process.argv[2] ?? 'integration';
const allowedModes = new Set(['integration', 'concurrency', 'full']);
if (!allowedModes.has(mode)) {
  throw new Error(`Unknown suite mode: ${mode}`);
}

const postgres = await new GenericContainer('postgres:16-alpine')
  .withEnvironment({
    POSTGRES_USER: 'booking',
    POSTGRES_PASSWORD: 'booking',
    POSTGRES_DB: 'booking_call_test',
  })
  .withExposedPorts(5432)
  .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/))
  .start();

const env = {
  ...process.env,
  DATABASE_URL: `postgresql://booking:booking@${postgres.getHost()}:${postgres.getMappedPort(5432)}/booking_call_test`,
  IDEMPOTENCY_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  MESSAGING_ENABLED: 'false',
  RUN_DATABASE_TESTS: 'true',
};

try {
  run('./node_modules/.bin/prisma', ['migrate', 'deploy']);
  run('./node_modules/.bin/prisma', ['db', 'seed']);

  if (mode === 'concurrency') {
    for (let iteration = 1; iteration <= 10; iteration += 1) {
      process.stdout.write(`Concurrency iteration ${iteration}/10\n`);
      run('./node_modules/.bin/jest', [
        '--runInBand',
        '--testPathPattern=booking-lifecycle.integration.e2e-spec.ts',
        '--testNamePattern=concurrent|shared target|races',
      ]);
    }
  } else {
    const pattern = mode === 'integration' ? ['--testPathPattern=integration.e2e-spec.ts'] : [];
    run('./node_modules/.bin/jest', ['--runInBand', '--detectOpenHandles', ...pattern]);
  }
} finally {
  await postgres.stop();
}

function run(command, args) {
  const result = spawnSync(command, args, { env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
  if (process.exitCode) throw new Error(`${command} exited with ${process.exitCode}`);
}
