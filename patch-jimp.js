const fs = require('fs');
const filePath = './node_modules/jimp-compact/dist/jimp.js';

let content = fs.readFileSync(filePath, 'utf8');

// Disable the CRC check entirely by making checkCRC always false
const patched = content.replace(
  'this._options.checkCRC&&r!==e',
  'false&&r!==e'
);

if (patched === content) {
  console.log('Pattern not found - trying alternative...');

  const patched2 = content.replace(
    'this.error(new Error("Crc error - "+e+" - "+r))',
    'console.warn("Crc warning - "+e+" - "+r)'
  );

  if (patched2 === content) {
    console.log('Both patterns failed.');
  } else {
    fs.writeFileSync(filePath, patched2);
    console.log('Patched successfully (method 2)! Now run: npx expo export --platform web');
  }
} else {
  fs.writeFileSync(filePath, patched);
  console.log('Patched successfully! Now run: npx expo export --platform web');
}