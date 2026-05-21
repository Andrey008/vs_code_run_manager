/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^vscode$': '<rootDir>/__mocks__/vscode.ts',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/test/**'],
  coverageThreshold: {
    global: { lines: 80 },
  },
};
