const {resolve} = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');

module.exports = {

  plugins: [
    new HtmlWebpackPlugin({
      title: 'GenomeSpy GL',
      hash: true
    })
  ],

  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist')
  },

  module: {
    rules: [
      {
        test: /\.(txt|[ct]sv)$/,
        use: 'raw-loader'
      },
      {
        test: /\.glsl$/,
        use: 'webpack-glsl-loader'
      },
    ]
  }
};
