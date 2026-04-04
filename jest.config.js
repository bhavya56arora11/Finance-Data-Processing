export default {
  testEnvironment: 'node',
  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/seed.js',
    '!src/server.js',
  ],
  coverageDirectory: 'coverage',
  testMatch: ['**/tests/**/*.test.js'],
};
