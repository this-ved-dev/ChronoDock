const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'development',
  entry: {
    widget: './src/renderer/widget/index.ts',
    settings: './src/renderer/settings/index.ts'
  },
  target: 'electron-renderer',
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.ts$/,
        include: /src/,
        use: [{ 
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.renderer.json'
          }
        }]
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  output: {
    path: path.resolve(__dirname, './dist/renderer'),
    filename: '[name].js'
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/renderer/widget/index.html',
      filename: 'widget.html',
      chunks: ['widget']
    }),
    new HtmlWebpackPlugin({
      template: './src/renderer/settings/index.html',
      filename: 'settings.html',
      chunks: ['settings']
    })
  ],
  resolve: {
    extensions: ['.ts', '.js']
  },
  devServer: {
    static: {
      directory: path.join(__dirname, './dist/renderer')
    },
    port: 8080,
    hot: true
  }
};
