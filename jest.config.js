export default {
    preset: 'ts-jest/presets/default-esm',
    testEnvironment: 'node',
    testMatch: ['**/src/tests/**/*.test.ts'],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/tests/**',
        '!src/app.ts'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts'],
    testTimeout: 10000,
    verbose: true,
    transform: {
        '^.+\\.ts$': ['ts-jest', {
            useESM: true
        }]
    },
    extensionsToTreatAsEsm: ['.ts'],
    moduleNameMapping: {
        '^(\\.{1,2}/.*)\\.js$': '$1'
    },
    globals: {
        'ts-jest': {
            useESM: true
        }
    }
};