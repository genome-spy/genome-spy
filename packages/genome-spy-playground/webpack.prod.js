const merge = require("webpack-merge");
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CleanWebpackPlugin = require("clean-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = {
    mode: "production",
    devtool: "source-map",

    plugins: [
        new CleanWebpackPlugin(["dist"]),
        new HtmlWebpackPlugin({
            title: "GenomeSpy Playground",
            hash: true
        }),
        new MiniCssExtractPlugin()
    ],

    module: {
        rules: [
            {
                test: /\.(s*)css$/,
                use: [MiniCssExtractPlugin.loader, "css-loader", "sass-loader"]
            },
            {
                test: /\.(txt|[ct]sv|glsl)$/,
                use: "raw-loader"
            },
            {
                test: /\.png$/,
                use: "url-loader"
            }
        ]
    }
};
