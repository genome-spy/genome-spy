const merge = require('webpack-merge');
const common = require('./webpack.common.js');
const path = require('path');
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = merge(common, {
    mode: 'production',
    devtool: 'source-map',
    
    entry: {
        main: './src/docEmbed.js'
    },
    
    plugins: [
        new MiniCssExtractPlugin({
            filename: '[name].css',
        })
    ],

    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'docs/app/')
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
            }
        ]
    }
});