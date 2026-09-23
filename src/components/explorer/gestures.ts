export const gestureSettings = { mouseStep: 100, touchStep: 64, axisSlop: 8, flickDistance: 18, flickVelocity: 0.5, flickAge: 100 };
export const bound = (index: number, count: number) => Math.max(0, Math.min(count - 1, index));
// A full step enters a view; 30% of a step in the opposite direction exits it.
export function dragIndex(start: number, current: number, distance: number, step: number, count: number) {
  const position = start + distance / step;
  let next = current;
  while (next < count - 1 && position >= next + (next < start ? 0.3 : 1)) next++;
  while (next > 0 && position <= next - (next > start ? 0.3 : 1)) next--;
  return next;
}
export function releaseIndex(start: number, current: number, distance: number, velocity: number, age: number, count: number) {
  if (Math.abs(distance) >= gestureSettings.flickDistance && Math.abs(velocity) >= gestureSettings.flickVelocity && age <= gestureSettings.flickAge) {
    return bound(current === start ? start + Math.sign(velocity) : current, count);
  }
  return current;
}
