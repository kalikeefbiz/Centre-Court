import * as pc from 'playcanvas';
import { COURT } from '../core/court';
import { validBallScale } from '../dev/metrics';
import { load } from './kira';
export const ROYAL_BALL = {
  url: 'assets/balls/royal-rally/Meshy_AI_Royal_Rally_1024220842_texture.glb',
  diameter: 0.067,
  sourceDiameter: 0.9526360034942627,
};
export class RoyalBall {
  readonly root = new pc.Entity('Royal Rally ball: visual only');
  status: 'loading' | 'ready' | 'error' = 'loading';
  error = '';
  visualScale = 1.5;
  setVisualScale(value: number) {
    if (!validBallScale(value)) return;
    this.visualScale = value;
    // Parent scales the already normalized model. Physics never reads this entity.
    this.root.setLocalScale(value, value, value);
  }
  private meshes: pc.MeshInstance[] = [];
  constructor(app: pc.Application) {
    app.root.addChild(this.root);
    this.setVisualScale(this.visualScale);
    load(app, ROYAL_BALL.url)
      .then((resource) => {
        const model = resource.instantiateRenderEntity({ castShadows: false });
        this.root.addChild(model);
        const scale = ROYAL_BALL.diameter / ROYAL_BALL.sourceDiameter;
        model.setLocalScale(scale, scale, scale);
        // Source Z bounds are slightly asymmetric; center the visual on the collision sphere.
        model.setLocalPosition(0, 0, -0.0004885047674179077 * scale);
        this.meshes = (model.findComponents('render') as pc.RenderComponent[]).flatMap(
          (r) => r.meshInstances,
        );
        if (!this.meshes.length) throw new Error('Royal Rally GLB has no render mesh');
        this.status = 'ready';
      })
      .catch((error) => {
        this.status = 'error';
        this.error = String(error);
        console.error(error);
      });
  }
  snapshot() {
    return {
      status: this.status,
      error: this.error,
      diameter: ROYAL_BALL.diameter,
      visualScale: this.visualScale,
      meshDiameter: this.meshes.length
        ? Math.max(...this.meshes[0].aabb.halfExtents.toArray()) * 2
        : 0,
      visualDiameter: ROYAL_BALL.diameter * this.visualScale,
      collisionRadius: COURT.radius,
      meshCount: this.meshes.length,
      visible: this.meshes.some((m) => m.visibleThisFrame),
      textured: this.meshes.some((m) => !!(m.material as pc.StandardMaterial).diffuseMap),
      scale: ROYAL_BALL.diameter / ROYAL_BALL.sourceDiameter,
    };
  }
}
