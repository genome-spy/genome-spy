const merge = require("webpack-merge");
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = {
    mode: "development",
    devtool: "source-map",

    plugins: [
        new HtmlWebpackPlugin({
            title: "GenomeSpy Playground"
        })
    ],

    resolve: {
        symlinks: false
    },

    module: {
        rules: [
            {
                test: /\.(s*)css$/,
                use: ["style-loader", "css-loader", "sass-loader"]
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
