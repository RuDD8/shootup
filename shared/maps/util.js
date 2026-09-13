/**
 * Build a full square grid from its top half: the bottom half is the top
 * rotated 180 degrees, which guarantees rotational symmetry so neither
 * spawn side ever gets better ground. Rows are strings of tile digits
 * (0 open, 1 wall, 2 cover); pass exactly size/2 rows of length size.
 */
export function rotationalGrid(topRows) {
  const size = topRows[0].length;
  if (topRows.length * 2 !== size) {
    throw new Error(`rotationalGrid needs ${size / 2} rows, got ${topRows.length}`);
  }
  for (const row of topRows) {
    if (row.length !== size) throw new Error(`row length ${row.length} != ${size}`);
  }
  const rows = [...topRows];
  for (let r = size / 2; r < size; r++) {
    rows.push([...topRows[size - 1 - r]].reverse().join(''));
  }
  return rows.join('');
}

/** The 180-degree twin of a spawn cell, for placing spawn B fairly. */
export function rotatedSpawn(spawn, size) {
  return { c: size - 1 - spawn.c, r: size - 1 - spawn.r };
}
