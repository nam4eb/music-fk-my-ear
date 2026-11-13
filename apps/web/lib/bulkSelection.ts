/** Stateless helpers for selecting visible tracks safely and batching API calls. */
export function toggleTrackSelection(selected: string[], trackId: string): string[] {
  return selected.includes(trackId)
    ? selected.filter(id => id !== trackId)
    : [...selected, trackId];
}

/** A select-all action replaces, rather than extends, selection across hidden filters. */
export function toggleVisibleSelection(selected: string[], visibleIds: string[]): string[] {
  const unique = [...new Set(visibleIds)];
  if (!unique.length) return [];
  return unique.every(id => selected.includes(id)) ? [] : unique;
}

export function chunkTrackIds(trackIds: string[], size: number): string[][] {
  if (!Number.isInteger(size) || size <= 0) throw new Error('Invalid batch size');
  const chunks: string[][] = [];
  for (let i = 0; i < trackIds.length; i += size) chunks.push(trackIds.slice(i, i + size));
  return chunks;
}
