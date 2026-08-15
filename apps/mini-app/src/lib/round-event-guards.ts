export function shouldHandleCurrentRoundEvent(
  currentRoundId: string | undefined,
  eventRoundId: string | undefined,
): boolean {
  if (!currentRoundId) return true;
  if (!eventRoundId) return true;
  return currentRoundId === eventRoundId;
}
