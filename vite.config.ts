import { defineConfig } from 'vitest/config';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const buildId = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
const assetRevision = createHash('sha256')
  .update(
    readFileSync('public/assets/characters/kira/Meshy_AI_Pink_Rebel_Arena_All_Animations.glb'),
  )
  .update(
    readFileSync(
      'public/assets/equipment/rackets/Meshy_AI_Pink_and_Black_Tennis_1024095819_texture.glb',
    ),
  )
  .digest('hex')
  .slice(0, 16);
export default defineConfig({
  base: './',
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
    __KIRA_ASSET_REVISION__: JSON.stringify(assetRevision),
  },
  plugins: [
    {
      name: 'release-identity',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'release.json',
          source: JSON.stringify({ release: 'KIRA-002.1', commit: buildId, assetRevision }),
        });
      },
    },
  ],
  build: { target: 'es2022' },
  test: { include: ['tests/**/*.test.ts'] },
});
