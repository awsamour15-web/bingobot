// Cleanup Service - Handles periodic maintenance tasks
// Includes cartela reservation cleanup

import { CartelaReservationService } from './cartela-reservation.service.js';

const CLEANUP_INTERVAL_MS = 30000; // 30 seconds

export const CleanupService = {
  _intervalId: undefined as NodeJS.Timeout | undefined,

  /**
   * Start periodic cleanup tasks
   */
  start(): void {
    if (CleanupService._intervalId) {
      console.log('Cleanup service already running');
      return;
    }

    console.log('Starting cleanup service...');
    CleanupService._intervalId = setInterval(async () => {
      try {
        const expiredCount = await CartelaReservationService.cleanupExpired();
        if (expiredCount > 0) {
          console.log(`Cleaned up ${expiredCount} expired cartela reservations`);
        }
      } catch (error) {
        console.error('Error in cleanup service:', error);
      }
    }, CLEANUP_INTERVAL_MS);
  },

  /**
   * Stop periodic cleanup tasks
   */
  stop(): void {
    if (CleanupService._intervalId) {
      clearInterval(CleanupService._intervalId);
      CleanupService._intervalId = undefined;
      console.log('Cleanup service stopped');
    }
  }
};