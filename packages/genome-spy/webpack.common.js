const { resolve } = require("path");
const path = require("path");

module.exports = {
    module: {
        rules: [
            {
                test: /\.(txt|[ct]sv|glsl)$/,
                use: "raw-loader"
            },
            {
                test: /\.(png|svg)$/,
                use: "url-loader"
            }
        ]
    }
};
