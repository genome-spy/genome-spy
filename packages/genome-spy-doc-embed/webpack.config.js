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
                test: /\.(txt|[ct]sv|glsl)$/,
                use: "raw-loader"
            },
            {
                test: /\.(s*)css$/,
                use: [MiniCssExtractPlugin.loader, "css-loader", "sass-loader"]
            },
            {
                test: /\.png$/,
                use: "url-loader"
            }
        ]
    }
};
