const merge = require('webpack-merge');
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
    mode: 'production',
    devtool: 'source-map',
    
    entry: {
        main: './src/index.js'
    },
    
    plugins: [
        new HtmlWebpackPlugin({
            title: 'GenomeSpy Playground',
            hash: true
        })
    ],

    output: {
        path: path.resolve(__dirname, 'dist')
    },

    module: {
        rules: [
            {
                test: /\.(s*)css$/,
                use: [
                    'style-loader',
                    'css-loader',
                    'sass-loader'
                ]
            },
            {
                test: /\.glsl$/,
                use: 'webpack-glsl-loader'
            }
        ]
    }
};