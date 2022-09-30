
module.exports = {
    transform: { '^.+\\.ts?$': 'ts-jest' },
    testEnvironment: 'node',
    // testRegex: '/tests/.*(test|spec)\\.(ts|tsx)$',
    testRegex: '/src/.*_test\\.(js|ts)$',
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node', 'd.ts'],
}