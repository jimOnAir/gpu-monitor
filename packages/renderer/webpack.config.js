const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const fs = require('fs');

/** Generate a random CSP nonce for script integrity. */
function generateCSPNonce() {
  const crypto = require('crypto');

  return crypto.randomBytes(16).toString('base64');
}

const CSP_NONCE = generateCSPNonce();
const SETTINGS_NONCE = generateCSPNonce();

/** Read the HTML template and inject the CSP nonce into the meta tag and script tag. */
function getTemplateWithNonce() {
  const templatePath = path.resolve(__dirname, 'index.html');
  let template = fs.readFileSync(templatePath, 'utf-8');

  // Replace CSP_NONCE placeholder in meta tag — use 'nonce-...' format for CSP
  const nonceValue = `'nonce-${CSP_NONCE}'`;
  template = template.replace(/<%- CSP_NONCE %>/g, nonceValue);

  // Add script tag with nonce before </body>
  template = template.replace(
    '</body>',
    `  <script defer="defer" src="main-bundle.js" nonce="${CSP_NONCE}"></script>\n</body>`,
  );

  return template;
}

/** Read the settings HTML template and inject the CSP nonce. */
function getSettingsTemplate() {
  const templatePath = path.resolve(__dirname, 'settings.html');
  let template = fs.readFileSync(templatePath, 'utf-8');

  // Replace CSP_NONCE placeholder in meta tag
  const nonceValue = `'nonce-${SETTINGS_NONCE}'`;
  template = template.replace(/<%- CSP_NONCE %>/g, nonceValue);

  // Add script tag with nonce before </body>
  template = template.replace(
    '</body>',
    `  <script defer="defer" src="settings-bundle.js" nonce="${SETTINGS_NONCE}"></script>\n</body>`,
  );

  return template;
}

module.exports = {
  entry: {
    main: path.resolve(__dirname, 'src/index.tsx'),
    settings: path.resolve(__dirname, 'src/settings.tsx'),
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name]-bundle.js',
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
      filename: 'index.html',
      chunks: ['main'],
      inject: false,
    }),
    new HtmlWebpackPlugin({
      templateContent: getSettingsTemplate(),
      filename: 'settings.html',
      chunks: ['settings'],
      inject: false,
    }),
  ],
  externals: {
    electron: 'commonjs electron',
    'electron-updater': 'commonjs electron-updater',
    'electron-window-state': 'commonjs electron-window-state',
  },
};
