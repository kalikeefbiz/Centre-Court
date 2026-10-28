import { describe, expect, it } from 'vitest';
import * as pc from 'playcanvas';
import { readyIdle, tennisGraph } from '../src/render/tennis-animation';
import { ANIMATIONS } from '../src/render/animation-registry';

describe('ready state is a cyclic Idle derivative, independent of action ownership', () => {
  it('bends only the dominant elbow without mutating source clip data or timing', () => {
    const rotation = new pc.AnimData(4, [0, 0, 0, 1, 0, 0, 0, 1]);
    const hips = new pc.AnimData(3, [0, 1, 0, 0, 1.01, 0]);
    const inputs = [new pc.AnimData(1, [0, 1])];
    const curves = [
      new pc.AnimCurve(
        [
          {
            entityPath: ['rig', 'mixamorig:RightForeArm'],
            component: 'graph',
            propertyPath: ['localRotation'],
          },
        ],
        0,
        0,
        pc.INTERPOLATION_LINEAR,
      ),
      new pc.AnimCurve(
        [
          {
            entityPath: ['rig', 'mixamorig:Hips'],
            component: 'graph',
            propertyPath: ['localPosition'],
          },
        ],
        0,
        1,
        pc.INTERPOLATION_LINEAR,
      ),
    ];
    const source = new pc.AnimTrack('Idle', 1, inputs, [rotation, hips], curves);
    const ready = readyIdle(source);
    expect(ready.duration).toBe(source.duration);
    expect(ready.inputs).toBe(inputs);
    expect(ready.curves).toBe(curves);
    expect(ready.outputs[1]).toBe(hips);
    expect(Array.from(rotation.data)).toEqual([0, 0, 0, 1, 0, 0, 0, 1]);
    Array.from(ready.outputs[0].data).forEach((value, i) =>
      expect(value).toBeCloseTo([0.5, 0, 0, Math.sqrt(3) / 2][i % 4], 12),
    );
    expect(Array.from(readyIdle(source).outputs[0].data)).toEqual(
      Array.from(ready.outputs[0].data),
    );
  });

  it('starts action layers at zero with independent fixed mask ownership', () => {
    const mask = { 'rig/Hips/Spine': { children: true } };
    const graph = tennisGraph(
      Object.entries(ANIMATIONS).map(([name, a]) => ({ name, loop: a.loop })),
      mask,
    );
    expect(graph.layers[1].weight).toBe(0);
    expect(graph.layers[1].mask).toBe(mask);
    expect(graph.layers[2].weight).toBe(0);
    expect(graph.layers[2].mask).toBeUndefined();
    expect(graph.layers[2].states.map((s) => s.name)).toEqual(['START', 'Serve', 'ForehandVolley']);
    expect(graph.layers[0].transitions).toEqual([{ from: 'START', to: 'Locomotion' }]);
  });
});
