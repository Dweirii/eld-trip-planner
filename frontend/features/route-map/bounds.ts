export type LngLat = [number, number];

/** [[west, south], [east, north]] around the points, or null when there are none. */
export function boundsOf(points: readonly LngLat[]): [LngLat, LngLat] | null {
  if (points.length === 0) return null;
  let [west, south] = points[0];
  let [east, north] = points[0];
  for (const [lng, lat] of points) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return [
    [west, south],
    [east, north],
  ];
}
