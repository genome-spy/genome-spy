const merge = require("webpack-merge");
const common = require("./webpack.common.js");
const path = require("path");
const CleanWebpackPlugin = require("clean-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = merge(common, {
    mode: "production",
    devtool: "source-map",

    entry: {
        main: "./src/singlePageApp.js"
    },

    plugins: [
        new CleanWebpackPlugin(["dist"]),
        new HtmlWebpackPlugin({
            title: "GenomeSpy"
        }),
        new MiniCssExtractPlugin({
            filename: "[name].css"
        })
    ],

    module: {
        rules: [
            {
                test: /\.(s*)css$/,
                use: [MiniCssExtractPlugin.loader, "css-loader", "sass-loader"]
            }
        ]
    }
});
