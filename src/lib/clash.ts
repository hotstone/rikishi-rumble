export interface ClashBout {
  east_id: number;
  east_name: string;
  west_id: number;
  west_name: string;
}

export interface ClashInfo {
  eastName: string;
  westName: string;
}

/** Bouts where both wrestlers belong to the same stable ("stablemate clash"). */
export function detectClashes(stableIds: Set<number>, bouts: ClashBout[]): ClashInfo[] {
  return bouts
    .filter((b) => stableIds.has(b.east_id) && stableIds.has(b.west_id))
    .map((b) => ({ eastName: b.east_name, westName: b.west_name }));
}
