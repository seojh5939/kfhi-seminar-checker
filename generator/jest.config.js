module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  testTimeout: 60000,
  moduleNameMapper: {
    '^shared$': '<rootDir>/../shared/src/index.ts',
  },
};
