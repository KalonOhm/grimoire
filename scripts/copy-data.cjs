const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'data');
const destDir = path.join(__dirname, '..', 'public', 'data');

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      console.log(`Copied: ${srcPath} -> ${destPath}`);
    }
  }
}

console.log('Copying data/ to public/data/...');
copyDir(srcDir, destDir);
console.log('Done!');