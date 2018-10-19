const {resolve} = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');

const CONFIG = {
  mode: 'development',
  //mode: 'production',

  entry: {
    app: resolve('./app.js')
  },

  devServer: {
    contentBase: path.join(__dirname, 'static')
  },
  
  plugins: [
    new HtmlWebpackPlugin({title: 'Spy2'})
  ]
};

// This line enables bundling against src in this repo rather than installed module
module.exports = env => env ? require('../../webpack.config.local')(CONFIG)(env) : CONFIG;
