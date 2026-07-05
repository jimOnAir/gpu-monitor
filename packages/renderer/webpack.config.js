const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const fs = require('fs');

/** Generate a random CSP nonce for script integrity. */
function generateCSPNonce() {
  const crypto = require('crypto');

  return crypto.randomBytes(16).toString('base64');
}

const CSP_NONCE = generateCSPNonce();

/** Read the HTML template and inject the CSP nonce into the meta tag and script tag. */
function getTemplateWithNonce() {
  const templatePath = path.resolve(__dirname, 'index.html');
  let template = fs.readFileSync(templatePath, 'utf-8');

  // Replace CSP_NONCE placeholder in meta tag
  template = template.replace(/<%- CSP_NONCE %>/g, CSP_NONCE);

  // Add script tag with nonce before </body>
  template = template.replace(
    '</body>',
    `  <script defer="defer" src="bundle.js" nonce="${CSP_NONCE}"></script>\n</body>`,
  );

  return template;
}

module.exports = {
  entry: path.resolve(__dirname, 'src/index.tsx'),
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    clean: true,
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      templateContent: getTemplateWithNonce(),
      inject: false, // Don't inject script tag — we include it manually in the template
    }),
  ],
  externals: {
    electron: 'commonjs electron',
  },
};
