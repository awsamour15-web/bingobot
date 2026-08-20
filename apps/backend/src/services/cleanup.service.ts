// Cleanup Service - Handles periodic maintenance tasks

export const CleanupService = {
  _intervalId: undefined as NodeJS.Timeout | undefined,

  start(): void {
    if (CleanupService._intervalId) return;
    console.log('Starting cleanup service...');
    // No-op interval kept for future cleanup tasks
    CleanupService._intervalId = setInterval(() => {}, 60_000);
  },

  stop(): void {
    if (CleanupService._intervalId) {
      clearInterval(CleanupService._intervalId);
      CleanupService._intervalId = undefined;
      console.log('Cleanup service stopped');
    }
  }
};