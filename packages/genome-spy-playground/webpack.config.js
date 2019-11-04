const merge = require('webpack-merge');
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
    mode: 'development',
    devtool: 'inline-source-map',
    
    entry: {
        main: './src/index.js'
    },
    
    plugins: [
        new HtmlWebpackPlugin({
            title: 'GenomeSpy Playground',
            hash: true
        })
    ],

    devServer: {
        // contentBase: path.join(__dirname, 'static')
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
            },
            {
                test: /\.(txt|[ct]sv)$/,
                use: 'raw-loader'
            }
        ]
    }
};