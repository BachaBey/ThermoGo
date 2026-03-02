const fs = require('fs');
const filePath = './node_modules/jimp-compact/dist/jimp.js';

const content = fs.readFileSync(filePath, 'utf8');

// Find the area around "Crc error"
const idx = content.indexOf('Crc error');
if (idx === -1) {
  console.log('Could not find "Crc error" at all');
} else {
  console.log('Found "Crc error" at index:', idx);
  console.log('Context (100 chars before and after):');
  console.log(JSON.stringify(content.slice(idx - 100, idx + 100)));
}
