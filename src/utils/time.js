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
