/**
 * Formats seconds into MM.SS format (e.g. 15.59 counting down to 00.00).
 * Uses a dot (.) separator instead of colon per contest spec.
 */
export function formatTimer(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined) return '--.--';
  const mins = Math.floor(Math.max(0, totalSeconds) / 60);
  const secs = Math.floor(Math.max(0, totalSeconds) % 60);
  return `${mins.toString().padStart(2, '0')}.${secs.toString().padStart(2, '0')}`;
}

/**
 * Formats duration in seconds into a human-readable string (e.g. "4m 12s", "45s", or "1h 15m").
 */
export function formatDuration(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined || isNaN(totalSeconds)) return '--';
  const totalSecs = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  if (hours > 0) {
    return `${hours}h ${mins}m ${secs}s`;
  }
  if (mins > 0) {
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  }
  return `${secs}s`;
}
