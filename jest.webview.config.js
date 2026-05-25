/** @type {import('jest').Config} */
module.exports = {
  displayName: 'webview',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/webview/src'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.webview.json' }],
  },
  moduleNameMapper: {
    // Redirect components' `import { postMessage } from '../vscodeApi'`
    // to the in-memory mock so tests can inspect dispatched messages.
    '^\\.\\./vscodeApi$': '<rootDir>/webview/src/__mocks__/vscodeApi.ts',
  },
};
