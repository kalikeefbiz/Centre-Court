import { gunzipSync } from 'node:zlib';
// Full-detail rigged Nova is a lossless archive because its GLB exceeds Git's 100 MiB limit.
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const file = 'public/assets/characters/nova/Nova_Fullres_Rigged.glb';
const sha = 'fb904e67374b70bff283809e72f33fb68ab654e9c3502b8dd3391813ada7ceb8';
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
