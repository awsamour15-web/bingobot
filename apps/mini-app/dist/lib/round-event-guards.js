export function shouldHandleCurrentRoundEvent(currentRoundId, eventRoundId) {
    if (!currentRoundId)
        return true;
    if (!eventRoundId)
        return true;
    return currentRoundId === eventRoundId;
}
//# sourceMappingURL=round-event-guards.js.map