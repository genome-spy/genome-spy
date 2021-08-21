const meta = require("./package.json");
const webpack = require("webpack");
const { merge } = require("webpack-merge");
const common = require("./webpack.common.js");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const path = require("path");

module.exports = merge(common, {
    mode: "production",
    devtool: "source-map",

    entry: {
        index: "./src/index.js"
    },

    output: {
        library: "genomeSpyEmbed",
        libraryTarget: "umd",
        clean: true
    },

    plugins: [
        new CleanWebpackPlugin(),
        new MiniCssExtractPlugin({
            filename: "[name].css"
        }),
        new webpack.BannerPlugin({
            banner: `${meta.name} v${
                meta.version
            } - Copyright ${new Date().getFullYear()} ${meta.author.name}`
        })
        //new BundleAnalyzerPlugin()
        //new HtmlWebpackPlugin({
        //    inlineSource: '.(js|css)$' // embed all javascript and css inline
        //}),
        //new HtmlWebpackInlineSourcePlugin()
    ],

    module: {
        rules: [
            {
                test: /\.(s?)css$/,
                use: [MiniCssExtractPlugin.loader, "css-loader", "sass-loader"]
            }
        ]
    }
});
