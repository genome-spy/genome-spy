const merge = require("webpack-merge");
const common = require("./webpack.common.js");
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = merge(common, {
    mode: "development",
    devtool: "eval-source-map",

    entry: {
        main: "./src/singlePageApp.js"
    },

    plugins: [
        new HtmlWebpackPlugin({
            title: "GenomeSpy"
        })
    ],

    devServer: {
        static: [
            {
                directory: path.join(__dirname, "static"),
                publicPath: "/"
            },
            {
                directory: path.join(__dirname, "private"),
                publicPath: "/private"
            }
        ]
    },

    module: {
        rules: [
            {
                test: /\.(s*)css$/,
                use: ["style-loader", "css-loader", "sass-loader"]
            }
        ]
    }
});
