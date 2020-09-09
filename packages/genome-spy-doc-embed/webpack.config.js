//const merge = require('webpack-merge');
//const common = require('./webpack.common.js');
const path = require("path");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = {
    mode: "production",
    devtool: "source-map",

    entry: {
        main: "./index.js"
    },

    plugins: [new MiniCssExtractPlugin()],

    output: {
        path: path.resolve(__dirname, "dist/")
    },

    module: {
        rules: [
            {
                test: /\.(s*)css$/,
                use: [MiniCssExtractPlugin.loader, "css-loader", "sass-loader"]
            },
            {
                test: /\.glsl$/,
                use: "webpack-glsl-loader"
            },
            {
                test: /\.png$/,
                use: "url-loader"
            }
        ]
    }
};
