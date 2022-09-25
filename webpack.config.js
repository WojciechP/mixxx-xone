const path = require('path')

module.exports = {
    entry: './src/xone.ts',
    mode: 'development',
    output: {
        filename: 'xone.js',
        path: path.resolve(__dirname, 'dist'),
    },
    resolve: { extensions: ['.ts'] },
    module: {
        rules: [{ test: /\.ts$/, use: 'ts-loader' }],
    },
    target: "node",
}