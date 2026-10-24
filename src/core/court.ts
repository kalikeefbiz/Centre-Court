// Metres. +Z is the human end, +Y is up. Lines are in.
export const COURT = Object.freeze({
  halfLength: 11.885,
  halfWidth: 4.115,
  doublesWidth: 5.485,
  service: 6.4,
  netCentre: 0.914,
  netEdge: 1.07,
  radius: 0.12,
});
export type Side = 0 | 1;
export const sign = (side: Side) => (side === 0 ? 1 : -1);
export const other = (side: Side): Side => (side === 0 ? 1 : 0);
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export interface Vec {
  x: number;
  y: number;
  z: number;
}
export const vec = (x = 0, y = 0, z = 0): Vec => ({ x, y, z });
export const inCourt = (p: Vec) =>
  Math.abs(p.x) <= COURT.halfWidth + COURT.radius &&
  Math.abs(p.z) <= COURT.halfLength + COURT.radius;
export function validServe(p: Vec, server: Side, deuce: boolean): boolean {
  const receiverZ = p.z * -sign(server);
  const targetX = (deuce ? -1 : 1) * sign(server);
  return (
    receiverZ >= -COURT.radius &&
    receiverZ <= COURT.service + COURT.radius &&
    p.x * targetX >= -COURT.radius &&
    p.x * targetX <= COURT.halfWidth + COURT.radius
  );
}
export const netHeight = (x: number) =>
  COURT.netCentre + (COURT.netEdge - COURT.netCentre) * Math.min(1, Math.abs(x) / 5.03);
export class Random {
  constructor(public seed = 314159) {}
  next() {
    this.seed = (Math.imul(1664525, this.seed) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  range(a: number, b: number) {
    return a + this.next() * (b - a);
  }
}
