export const CHARACTER_IDS = ['jax', 'kira', 'zuri', 'dante', 'nova', 'rico'] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];
export interface Profile {
  name: string;
  title: string;
  archetype: string;
  signature: string;
  color: string;
  available: boolean;
  asset?: string;
  tactics: Record<string, number>;
  power: number;
  risk: number;
  approach: number;
  recovery: number;
  description: string;
}
export const ROSTER: Record<CharacterId, Profile> = {
  jax: {
    name: 'Jax',
    title: 'The Showman',
    archetype: 'Trickster / All-Court',
    signature: 'Showtime',
    color: '#ffc16e',
    available: false,
    tactics: { 'short angle': 0.3, 'slice recovery': 0.15 },
    power: 0,
    risk: 0.02,
    approach: 0.2,
    recovery: 0.9,
    description: 'Creative angles, deceptive tempo. Character model awaiting upload.',
  },
  kira: {
    name: 'Kira',
    title: 'The Drifter',
    archetype: 'Speed / Counter',
    signature: 'Drift Break',
    color: '#f58bb4',
    available: true,
    asset: 'assets/characters/kira/Kira_Midres_Rigged.glb',
    tactics: { crosscourt: 0.12, 'deep neutral': 0.08 },
    power: -0.02,
    risk: -0.01,
    approach: -0.12,
    recovery: 1,
    description: 'Agile recovery, consistent returns and precise counterattacks.',
  },
  zuri: {
    name: 'Zuri',
    title: 'The Phenom',
    archetype: 'Aggressive Power',
    signature: 'Phenomenon',
    color: '#81dfaa',
    available: true,
    asset: 'assets/characters/zuri/Zuri_Tennis.glb',
    tactics: { 'down the line': 0.25, 'short angle': 0.18, 'deep neutral': -0.18 },
    power: 0.13,
    risk: 0.055,
    approach: 0.15,
    recovery: 0.88,
    description: 'Baseline pressure and bold placement; greater risk of errors.',
  },
  dante: {
    name: 'Dante',
    title: 'The Grinder',
    archetype: 'Defensive Counter',
    signature: 'Iron Return',
    color: '#b4c9ed',
    available: true,
    asset: 'assets/characters/dante/Dante_Tennis.glb',
    tactics: { 'deep neutral': 0.21, 'slice recovery': 0.12, 'down the line': -0.2 },
    power: -0.04,
    risk: -0.015,
    approach: -0.3,
    recovery: 1,
    description: 'Deep returns, patient defense and rally endurance.',
  },
  nova: {
    name: 'Nova',
    title: 'The Wildcard',
    archetype: 'Unpredictable Shotmaker',
    signature: 'Wildcard',
    color: '#f3d65e',
    available: true,
    asset: 'assets/characters/nova/Nova_Fullres_Rigged.glb',
    tactics: {
      'defensive lob': 0.23,
      'slice recovery': 0.24,
      'short angle': 0.16,
      'deep neutral': -0.15,
    },
    power: 0.01,
    risk: 0.02,
    approach: 0.05,
    recovery: 0.86,
    description:
      'Spin variety, lobs, slices and changing tempo. Full-detail beta rig; extreme shoulder and armband poses need refinement. Larger first load.',
  },
  rico: {
    name: 'Rico',
    title: 'The Veteran',
    archetype: 'Tactical All-Court',
    signature: 'Final Read',
    color: '#ee8b7d',
    available: true,
    asset: 'assets/characters/rico/Rico_Tennis.glb',
    tactics: { crosscourt: 0.08, 'down the line': 0.12, 'slice recovery': 0.06 },
    power: 0.02,
    risk: -0.01,
    approach: 0.06,
    recovery: 1,
    description: 'Efficient positioning, controlled pace and calculated attacks.',
  },
};
export const AVAILABLE = CHARACTER_IDS.filter((id) => ROSTER[id].available);
export function isCharacter(value: unknown): value is CharacterId {
  return CHARACTER_IDS.includes(value as CharacterId);
}
