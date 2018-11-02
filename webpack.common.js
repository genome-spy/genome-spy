const {resolve} = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CleanWebpackPlugin = require('clean-webpack-plugin');
const WebpackMd5Hash = require('webpack-md5-hash');
const path = require('path');

module.exports = {

  plugins: [
    new CleanWebpackPlugin(['dist']),
    new HtmlWebpackPlugin({
      title: 'GenomeSpy GL',
      hash: true
    }),
    new WebpackMd5Hash()
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
