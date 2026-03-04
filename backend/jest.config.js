export default {
  testEnvironment: 'node',
  transform: {},
  extensionsToTreatAsEsm: [],
  testMatch: ['**/__tests__/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'json', 'html'],
};
