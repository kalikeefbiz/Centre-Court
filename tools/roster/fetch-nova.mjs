import { gunzipSync } from 'node:zlib';
// Full-detail rigged Nova is a lossless archive because its GLB exceeds Git's 100 MiB limit.
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const file = 'public/assets/characters/nova/Nova_Fullres_Rigged.glb';
const sha = '6a772b90356a83c92ab81d6bffedccc751d4fc2e7d5819cd440f19b9c0aaeb15';
if (!existsSync(file)) {
  mkdirSync('public/assets/characters/nova', { recursive: true });
  writeFileSync(
    file,
    gunzipSync(readFileSync('assets/characters/nova/Nova_Fullres_Rigged.glb.gz')),
  );
}
if (createHash('sha256').update(readFileSync(file)).digest('hex') !== sha)
  throw new Error('Nova integrity mismatch');
console.log('Full-detail Nova verified. No geometry or texture reduction.');
