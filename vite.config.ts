import { defineConfig } from 'vitest/config';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { KIRA } from './src/render/athlete-config';
const buildId = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
const assetRevision = createHash('sha256')
  .update(readFileSync(`public/${KIRA.characterUrl}`))
  .update(readFileSync('assets/characters/nova/Nova_Fullres_Rigged.glb.gz'))
  .update(readFileSync('public/assets/characters/dante/Dante_Tennis.glb'))
  .update(readFileSync('public/assets/characters/rico/Rico_Tennis.glb'))
  .update(readFileSync('public/assets/characters/zuri/Zuri_Tennis.glb'))
  .update(
    readFileSync(
      'public/assets/equipment/rackets/Meshy_AI_Pink_and_Black_Tennis_1024095819_texture.glb',
    ),
  )
  .update(
    readFileSync('public/assets/balls/royal-rally/Meshy_AI_Royal_Rally_1024220842_texture.glb'),
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
          source: JSON.stringify({ release: 'GOAL-009', commit: buildId, assetRevision }),
        });
      },
    },
  ],
  build: { target: 'es2022' },
  test: { include: ['tests/**/*.test.ts'] },
});
