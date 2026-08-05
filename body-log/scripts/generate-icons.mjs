import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const svgPath = path.join(__dirname, 'icon-source.svg');
const svgBuffer = fs.readFileSync(svgPath);

const iconsDir = path.join(root, 'public', 'icons');
fs.mkdirSync(iconsDir, { recursive: true });

const sizes = [48, 72, 96, 128, 144, 152, 192, 256, 384, 512];

async function main() {
  for (const size of sizes) {
    await sharp(svgBuffer, { density: 384 })
      .resize(size, size)
      .png()
      .toFile(path.join(iconsDir, `icon-${size}.png`));
  }

  // Next.js App Router special files
  await sharp(svgBuffer, { density: 384 })
    .resize(512, 512)
    .png()
    .toFile(path.join(root, 'app', 'icon.png'));

  await sharp(svgBuffer, { density: 384 })
    .resize(180, 180)
    .flatten({ background: '#15111a' })
    .png()
    .toFile(path.join(root, 'app', 'apple-icon.png'));

  await sharp(svgBuffer, { density: 384 })
    .resize(32, 32)
    .png()
    .toFile(path.join(iconsDir, 'favicon-32.png'));

  console.log('Icons generated:', sizes.join(', '), '+ app/icon.png, app/apple-icon.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
