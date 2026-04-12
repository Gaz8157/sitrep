/** Convert world coordinates to 6-digit grid string.
 *  Uses 100m grid squares to match in-game Arma Reforger map coordinates.
 *  Subtracts map offsets so grids match in-game coordinates. */
export function worldToGrid6(x: number, z: number, offsetX = 0, offsetZ = 0): string {
  const gx = Math.floor((x - offsetX) / 100);
  const gz = Math.floor((z - offsetZ) / 100);
  return `${String(Math.max(0, gx)).padStart(3, "0")}-${String(Math.max(0, gz)).padStart(3, "0")}`;
}

/** Convert grid string to world coordinates. Adds map offsets. Centers in the 100m square. */
export function gridToWorld(grid: string, offsetX = 0, offsetZ = 0): [number, number] {
  const [gxStr, gzStr] = grid.split("-");
  const gx = parseInt(gxStr, 10);
  const gz = parseInt(gzStr, 10);
  return [gx * 100 + 50 + offsetX, gz * 100 + 50 + offsetZ];
}
