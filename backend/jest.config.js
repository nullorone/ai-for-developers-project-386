/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.module.ts', '!src/main.ts'],
  coverageDirectory: './coverage',
  coverageThreshold: {
    './src/availability/availability.service.ts': {
      branches: 45,
      functions: 50,
      lines: 65,
      statements: 65,
    },
    './src/bookings/bookings.service.ts': {
      branches: 70,
      functions: 85,
      lines: 80,
      statements: 80,
    },
    './src/slots/slot-generator.service.ts': {
      branches: 85,
      functions: 100,
      lines: 95,
      statements: 95,
    },
    './src/bookings/idempotency-crypto.service.ts': {
      branches: 75,
      functions: 100,
      lines: 90,
      statements: 90,
    },
    './src/common/validation/validation.pipe.ts': {
      branches: 70,
      functions: 80,
      lines: 85,
      statements: 85,
    },
    './src/slots/slots.service.ts': {
      branches: 60,
      functions: 50,
      lines: 65,
      statements: 65,
    },
  },
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  clearMocks: true,
};
