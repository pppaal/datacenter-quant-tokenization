export function buildYearMap<T extends { year: number }>(rows: T[]): Map<number, T> {
  return new Map(rows.map((row) => [row.year, row] as const));
}

export function getYearValue<T extends { year: number }>(
  rows: Map<number, T> | T[],
  year: number
): T | undefined {
  if (rows instanceof Map) return rows.get(year);
  return rows.find((row) => row.year === year);
}
