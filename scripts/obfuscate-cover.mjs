import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEY = Buffer.from([0x5a, 0xe3, 0x91, 0x0c, 0x77, 0xb4, 0x2d, 0xf8]);

function obfuscate(srcRel, destRel) {
  const buf = readFileSync(join(root, srcRel));
  for (let i = 0; i < buf.length; i++) buf[i] ^= KEY[i % KEY.length];
  const dest = join(root, destRel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  console.log(srcRel, '->', destRel, buf.length, 'bytes');
}

obfuscate('assets/disk.webp', 'assets/obf/d');
obfuscate('assets/video-2-opt.mp4', 'assets/obf/v');
