module.exports = {
  clearMocks: true,
  moduleFileExtensions: ['js', 'ts'],
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.[jt]s$': 'ts-jest'
  },
  transformIgnorePatterns: ['/node_modules/(?!@octokit/)'],
  verbose: true
}