const {resolve} = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');

module.exports = {
    entry: {
        main: './src/index.js'
    },
    
    output: {
        filename: '[name].js',
        library: 'genomeSpyLib',
        libraryTarget: 'umd',
        path: path.resolve(__dirname, 'dist')
    },

    plugins: [
        new HtmlWebpackPlugin({
            title: 'GenomeSpy',
            hash: true,
            template: './src/index.html',
            inject: 'head'
        })
    ],

    module: {
        rules: [
            {
                test: /\.(txt|[ct]sv)$/,
                use: 'raw-loader'
            },
            {
                test: /\.glsl$/,
                use: 'webpack-glsl-loader'
            },
        ]
    }
};
