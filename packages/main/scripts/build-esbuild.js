const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const isWatch = process.argv.includes('--watch');
const outdir = path.resolve(__dirname, '../dist/electron-app');
const assetsDir = path.resolve(__dirname, '../assets');

/** Ensure assets directory exists and generate PNG icons. */
function generateIcons() {
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  const { generateIcon } = require('./generate-icons');

  const ICON_SIZE = 24;
  const icons = {
    normal:   { bg: [34, 197, 94], accent: [255, 255, 255] },   // green bg, white GPU
    warning:  { bg: [234, 179, 8], accent: [255, 255, 255] },   // yellow bg, white GPU
    critical: { bg: [239, 68, 68], accent: [255, 255, 255] },   // red bg, white GPU
    default:  { bg: [100, 116, 139], accent: [255, 255, 255] }, // gray bg, white GPU
  };

  for (const [name, { bg, accent }] of Object.entries(icons)) {
    const outFile = path.join(assetsDir, `${name}.png`);
    const pngBuffer = generateIcon(ICON_SIZE, bg[0], bg[1], bg[2], accent[0], accent[1], accent[2]);
    fs.writeFileSync(outFile, pngBuffer);
  }
  console.log('Icons generated in assets/:', Object.keys(icons).join(', '));
}

// Type-check with tsc first, then generate icons and bundle
console.log('Running TypeScript type-check...');
try {
  execSync('npx tsc --noEmit', { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
  console.log('Type-check passed.');
} catch (err) {
  console.error('Type-check failed — aborting build.');
  process.exit(1);
}

// Generate icons first, then build
generateIcons();

const commonOptions = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  outdir,
  format: 'cjs',
  sourcemap: true,
  external: ['electron'],
  logLevel: 'info',
  tsconfig: path.resolve(__dirname, '../tsconfig.json'),
};

Promise.all([
  esbuild.build({
    ...commonOptions,
    entryPoints: [path.resolve(__dirname, '../src/main.ts')],
  tsconfig: path.resolve(__dirname, '../tsconfig.json'),
  }),
  esbuild.build({
    ...commonOptions,
    entryPoints: [path.resolve(__dirname, '../src/preload.ts')],
  tsconfig: path.resolve(__dirname, '../tsconfig.json'),
  }),
])
  .then(() => {
    console.log('main + preload build complete');
    if (isWatch) {
      console.log('watching for changes...');
    }
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
