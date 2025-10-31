export function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}
export function distanceBetweenPoints(pointA, pointB) {
    return Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y);
}
export function linearInterpolate(start, end, t) {
    return start + (end - start) * t;
}
export function projectPointOntoSegment(segmentStart, segmentEnd, point) {
    const vectorX = segmentEnd.x - segmentStart.x;
    const vectorY = segmentEnd.y - segmentStart.y;
    const fromStartX = point.x - segmentStart.x;
    const fromStartY = point.y - segmentStart.y;
    const numerator = fromStartX * vectorX + fromStartY * vectorY;
    const denominator = vectorX * vectorX + vectorY * vectorY;
    const t = clamp(numerator / denominator, 0, 1);
    return { x: segmentStart.x + vectorX * t, y: segmentStart.y + vectorY * t, t };
}