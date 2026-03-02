/**
 * post-export.js
 * Run this after: npx expo export --platform web
 * It patches dist/index.html with correct PWA meta tags and copies your icons.
 */

const fs   = require('fs');
const path = require('path');

// ── 1. Copy icons into dist ──────────────────────────────────────────────────
const iconSrc = path.join(__dirname, 'public', 'icons');
const iconDst = path.join(__dirname, 'dist',   'icons');

if (!fs.existsSync(iconDst)) fs.mkdirSync(iconDst, { recursive: true });

['icon-192.png', 'icon-512.png'].forEach(file => {
  const src = path.join(iconSrc, file);
  const dst = path.join(iconDst, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log('Copied:', file);
  } else {
    console.warn('Missing:', src);
  }
});

// ── 2. Copy manifest.json into dist ─────────────────────────────────────────
const manifestSrc = path.join(__dirname, 'public', 'manifest.json');
const manifestDst = path.join(__dirname, 'dist',   'manifest.json');
fs.copyFileSync(manifestSrc, manifestDst);
console.log('Copied: manifest.json');

// ── 3. Patch dist/index.html ─────────────────────────────────────────────────
const indexPath = path.join(__dirname, 'dist', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

const pwaTags = `
  <!-- PWA Manifest -->
  <link rel="manifest" href="/manifest.json" />

  <!-- Theme color -->
  <meta name="theme-color" content="#006C95" />
  <meta name="background-color" content="#006C95" />

  <!-- iOS PWA -->
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="ThermoGo" />
  <link rel="apple-touch-icon" href="/icons/icon-192.png" />
  <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-192.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-192.png" />
  <link rel="apple-touch-icon" sizes="167x167" href="/icons/icon-192.png" />

  <!-- Android / Standard -->
  <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
  <link rel="icon" type="image/png" sizes="512x512" href="/icons/icon-512.png" />
`;

// Inject right before </head>
if (html.includes('</head>')) {
  html = html.replace('</head>', pwaTags + '</head>');
  fs.writeFileSync(indexPath, html);
  console.log('Patched: dist/index.html with PWA tags');
} else {
  console.warn('Could not find </head> in index.html');
}

// ── 4. Copy netlify.toml into dist ───────────────────────────────────────────
const tomlContent = `[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
`;
fs.writeFileSync(path.join(__dirname, 'dist', 'netlify.toml'), tomlContent);
fs.writeFileSync(path.join(__dirname, 'netlify.toml'), tomlContent);
console.log('Written: netlify.toml (root + dist)');

console.log('\n✅ Done! Your dist/ folder is ready to deploy.');
