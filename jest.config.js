module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  verbose: true,
  testTimeout: 20000,
  clearMocks: true,
  moduleNameMapper: {
    '^jose$': '<rootDir>/tests/mocks/joseMock.js'
  }
};
