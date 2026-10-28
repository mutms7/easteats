import sharp from 'sharp';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const source = await readFile(new URL('../../public/icon-maskable.svg', import.meta.url), 'utf8');
const assets = new URL('../assets/', import.meta.url);
await mkdir(assets, { recursive: true });
await sharp(Buffer.from(source)).resize(1024).flatten({ background: '#E12D12' }).removeAlpha().png().toFile(fileURLToPath(new URL('icon.png', assets)));
const foreground = source.replace(/<path fill="#E12D12" d="M0 0h192v192H0z"\/>/, '');
await sharp(Buffer.from(foreground)).resize(1024).png().toFile(fileURLToPath(new URL('adaptive-foreground.png', assets)));
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  await sharp(Buffer.from(source)).resize(size).flatten({ background: '#E12D12' }).removeAlpha().png().toFile(fileURLToPath(new URL(`../../public/${name}`, import.meta.url)));
}
