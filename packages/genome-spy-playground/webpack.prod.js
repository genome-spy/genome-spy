const merge = require("webpack-merge");
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CleanWebpackPlugin = require("clean-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = {
    mode: "production",
    devtool: "source-map",

    entry: {
        main: "./src/index.js"
    },

    plugins: [
        new CleanWebpackPlugin(["dist"]),
        new HtmlWebpackPlugin({
            title: "GenomeSpy Playground",
            hash: true
        }),
        new MiniCssExtractPlugin()
    ],

    output: {
        path: path.resolve(__dirname, "dist")
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
                test: /\.(txt|[ct]sv)$/,
                use: "raw-loader"
            }
        ]
    }
};
