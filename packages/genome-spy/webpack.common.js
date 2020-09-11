const { resolve } = require("path");
const path = require("path");

module.exports = {
    module: {
        rules: [
            {
                test: /\.(txt|[ct]sv)$/,
                use: "raw-loader"
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
