import * as pc from 'playcanvas';
import { clamp } from '../core/court';
import type { LocomotionState } from '../core/locomotion';

export const SHUFFLE_CYCLES = {
  ShuffleLeft: [45 / 30, 63 / 30],
  ShuffleRight: [39 / 30, 51 / 30],
} as const;
/** Runtime derivation from owned tracks. Trim startup/crossover/hop sections;
 * close the final 3 samples toward the opening pose with quaternion interpolation.
 * Original GLB/13 source tracks remain byte-identical and available to inspection.
 */
export function shuffleCycle(track: pc.AnimTrack, start: number, end: number) {
  const duration = end - start,
    count = Math.round(duration * 30) + 1;
  const times = Array.from({ length: count }, (_, i) => (i * duration) / (count - 1));
  const outputs: pc.AnimData[] = [],
    curves: pc.AnimCurve[] = [];
  for (const curve of track.curves) {
    const input = track.inputs[curve.input].data,
      output = track.outputs[curve.output];
    const size = output.components,
      data: number[] = [];
    const rotation = curve.paths.some((p) => p.propertyPath[0] === 'localRotation');
    for (const time of times) {
      const t = time + start;
      let i = 0;
      while (i < input.length - 2 && input[i + 1] <= t) i++;
      const f = clamp((t - input[i]) / Math.max(1e-8, input[i + 1] - input[i]), 0, 1);
      if (rotation) {
        const a = new pc.Quat(
          ...(Array.from(output.data.slice(i * size, i * size + 4)) as [
            number,
            number,
            number,
            number,
          ]),
        );
        const b = new pc.Quat(
          ...(Array.from(output.data.slice((i + 1) * size, (i + 1) * size + 4)) as [
            number,
            number,
            number,
            number,
          ]),
        );
        const q = new pc.Quat().slerp(a, b, f);
        data.push(q.x, q.y, q.z, q.w);
      } else
        for (let k = 0; k < size; k++)
          data.push(output.data[i * size + k] * (1 - f) + output.data[(i + 1) * size + k] * f);
    }
    for (let n = count - 3; n < count; n++) {
      const weight = (n - (count - 4)) / 3;
      if (rotation) {
        const q = new pc.Quat(
          ...(data.slice(n * size, n * size + 4) as [number, number, number, number]),
        );
        const first = new pc.Quat(...(data.slice(0, 4) as [number, number, number, number]));
        q.slerp(q, first, weight);
        data.splice(n * size, 4, q.x, q.y, q.z, q.w);
      } else
        for (let k = 0; k < size; k++)
          data[n * size + k] = data[n * size + k] * (1 - weight) + data[k] * weight;
    }
    curves.push(new pc.AnimCurve(curve.paths, 0, outputs.length, pc.INTERPOLATION_LINEAR));
    outputs.push(new pc.AnimData(size, data));
  }
  return new pc.AnimTrack(
    track.name + ':tennis-cycle',
    duration,
    [new pc.AnimData(1, times)],
    outputs,
    curves,
  );
}
export const BLEND_CHANNELS = [
  'Idle',
  'Walk',
  'Run',
  'Left',
  'Right',
  'Backward',
  'BackwardRun',
] as const;
export function movementWeights(m: LocomotionState, out: number[], preparing = false) {
  const motion = clamp(m.speed / 0.65, 0, 1) * (m.reversing ? 0.88 : m.braking ? 0.95 : 1);
  const lateral =
    Math.abs(m.velocity.x) / Math.max(1e-8, Math.abs(m.velocity.x) + Math.abs(m.velocity.z));
  const sprintSide = preparing ? 0 : clamp((m.speed - 3.8) / 2.2, 0, 1);
  const run = clamp((m.speed - 1.8) / 2.5, 0, 1);
  const backward = m.velocity.z > 0 ? 1 : 0;
  out[0] = 1 - motion;
  out[1] = motion * (1 - lateral) * (1 - run) * (1 - backward);
  out[2] = motion * ((1 - lateral) * run * (1 - backward) + lateral * sprintSide);
  out[3] = m.velocity.x < 0 ? motion * lateral * (1 - sprintSide) : 0;
  out[4] = m.velocity.x > 0 ? motion * lateral * (1 - sprintSide) : 0;
  out[5] = motion * (1 - lateral) * backward * (1 - run);
  out[6] = motion * (1 - lateral) * backward * run;
  return sprintSide;
}
/** Official AnimStateGraph / direct blend tree API; a full-body locomotion base
 * and masked upper-body stroke layer keep the legs moving while preparing. */
export function tennisGraph(
  states: { name: string; loop: boolean }[],
  mask: Record<string, { children: boolean }>,
) {
  return {
    layers: [
      {
        name: 'Base',
        states: [
          { name: 'START' },
          ...states,
          {
            name: 'Locomotion',
            loop: true,
            blendTree: {
              type: pc.ANIM_BLEND_DIRECT,
              syncAnimations: false,
              parameters: BLEND_CHANNELS.map((n) => 'weight' + n),
              children: BLEND_CHANNELS.map((name) => ({
                name,
                speed:
                  name === 'Walk'
                    ? 1.03333294 / 0.6
                    : name === 'Backward'
                      ? -1.03333294 / 0.6
                      : name === 'BackwardRun'
                        ? -0.633333 / 0.6
                        : name === 'Run'
                          ? 0.633333 / 0.6
                          : name === 'Right'
                            ? 0.4 / 0.6
                            : 1,
              })),
            },
          },
        ],
        transitions: [{ from: 'START', to: 'Locomotion' }],
      },
      {
        name: 'Stroke',
        weight: 0,
        mask,
        states: [{ name: 'START' }, ...states.filter((s) => !s.loop)],
        transitions: [{ from: 'START', to: 'Serve' }],
      },
    ],
    parameters: Object.fromEntries(
      BLEND_CHANNELS.map((n) => [
        'weight' + n,
        { type: pc.ANIM_PARAMETER_FLOAT, value: n === 'Idle' ? 1 : 0 },
      ]),
    ),
  };
}
