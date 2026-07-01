const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const { execFileSync, execSync } = require('child_process');

const isWatch = process.argv.includes('--watch');
const outdir = path.resolve(__dirname, '../dist/electron-app');
const assetsDir = path.resolve(__dirname, '../assets');

/**
 * GPU silhouette draw operations for ImageMagick.
 * Each element is a separate -draw argument to avoid nested quoting issues.
 * Used for all states; only the background color changes.
 */
const GPU_DRAW = [
  '-draw', 'rectangle 4 6 17 16',       // GPU body (shroud) — white (default)
  '-fill', '#0f172a',
  '-draw', 'circle 9 13 7 11',          // GPU fan
  '-fill', 'white',
  '-draw', 'rectangle 13 16 20 20',     // PCIe connector tab
];

/** Ensure assets directory exists and generate PNG icons there via ImageMagick. */
function generateIcons() {
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  // Verify ImageMagick is available
  try {
    execSync('magick -version', { stdio: 'pipe' });
  } catch {
    console.error('ImageMagick not found — skipping icon generation');
    return;
  }

  const ICON_SIZE = 24;
  const icons = {
    normal:   '#22c55e',   // green
    warning:  '#eab308',   // yellow
    critical: '#ef4444',   // red
    default:  '#64748b',   // gray
  };

  for (const [name, color] of Object.entries(icons)) {
    const outFile = path.join(assetsDir, `${name}.png`);
    execFileSync('magick', [
      '-size', `${ICON_SIZE}x${ICON_SIZE}`,
      `xc:${color}`,
      ...GPU_DRAW,
      outFile,
    ], { stdio: 'pipe' });
  }
  console.log('Icons generated in assets/:', Object.keys(icons).join(', '));
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
};

Promise.all([
  esbuild.build({
    ...commonOptions,
    entryPoints: [path.resolve(__dirname, '../src/main.ts')],
  }),
  esbuild.build({
    ...commonOptions,
    entryPoints: [path.resolve(__dirname, '../src/preload.ts')],
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
