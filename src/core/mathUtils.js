// ===========================================
// File: src/core/mathUtils.js
// ===========================================

/**
 * Returns the Euclidean distance between two points {x, y}.
 */
export function distanceBetweenPoints(a, b) {
  const dx = (a?.x ?? 0) - (b?.x ?? 0);
  const dy = (a?.y ?? 0) - (b?.y ?? 0);
  return Math.hypot(dx, dy);
}

/**
 * Linear interpolation between a and b by t in [0, 1].
 */
export function linearInterpolate(a, b, t) {
  const tt = Math.max(0, Math.min(1, t));
  return a + (b - a) * tt;
}

/**
 * Clamp a value to the inclusive range [min, max].
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Normalize any angle (radians) to (-PI, PI].
 */
export function normalizeAngleRadians(radians) {
  let a = radians;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Projects a point onto a line segment AB and returns the closest point on that segment.
 * Also returns the interpolation factor t (0=start, 1=end) and distance from the point.
 *
 * @param {{x:number,y:number}} p - Point to project
 * @param {{x:number,y:number}} a - Segment start
 * @param {{x:number,y:number}} b - Segment end
 * @returns {{x:number,y:number,t:number,distance:number}}
 */
export function projectPointOntoSegment(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const abLenSq = abx * abx + aby * aby;

  let t = 0;
  if (abLenSq > 0) {
    t = (apx * abx + apy * aby) / abLenSq;
    t = clamp(t, 0, 1);
  }

  const closestX = a.x + abx * t;
  const closestY = a.y + aby * t;
  const dx = p.x - closestX;
  const dy = p.y - closestY;

  return {
    x: closestX,
    y: closestY,
    t,
    distance: Math.hypot(dx, dy),
  };
}
