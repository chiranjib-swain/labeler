module.exports = {
  clearMocks: true,
  moduleFileExtensions: ['js', 'ts'],
  moduleNameMapper: {
    '^@octokit/plugin-retry$': '<rootDir>/__mocks__/@octokit/plugin-retry.ts'
  },
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  verbose: true
}