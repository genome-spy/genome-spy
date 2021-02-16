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
        contentBase: [
            path.join(__dirname, "static"),
            path.join(__dirname, "private")
        ],
        contentBasePublicPath: ["/", "/private"]
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
