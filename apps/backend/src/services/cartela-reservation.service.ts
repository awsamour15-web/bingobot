// Cartela Reservation Service
// Manages temporary locks on cartelas during selection process

import prisma from '../lib/prisma.js';

const RESERVATION_DURATION_MS = 30000; // 30 seconds
const MAX_SELECT = 2; // Maximum number of cartelas a player can reserve/select

export class CartelaAlreadyReservedError extends Error {
  constructor(roundId: string, cartelaNumber: number, reservedBy?: string) {
    const message = reservedBy 
      ? `Cartela ${cartelaNumber} is reserved by another player in round ${roundId}`
      : `Cartela ${cartelaNumber} is already reserved in round ${roundId}`;
    super(message);
    this.name = 'CartelaAlreadyReservedError';
  }
}

export class ReservationNotFoundError extends Error {
  constructor(roundId: string, cartelaNumber: number, playerId: string) {
    super(`No reservation found for cartela ${cartelaNumber} by player ${playerId} in round ${roundId}`);
    this.name = 'ReservationNotFoundError';
  }
}

export class MaxCartelaLimitExceededError extends Error {
  constructor(roundId: string, playerId: string, currentCount: number) {
    super(`Player ${playerId} has reached maximum limit of ${MAX_SELECT} cartelas in round ${roundId} (currently has ${currentCount})`);
    this.name = 'MaxCartelaLimitExceededError';
  }
}

export const CartelaReservationService = {
  /**
   * Reserve a cartela for a player temporarily.
   * Throws CartelaAlreadyReservedError if cartela is already taken or reserved.
   * Throws MaxCartelaLimitExceededError if player already has MAX_SELECT cartelas reserved/joined.
   */
  async reserve(roundId: string, playerId: string, cartelaNumber: number): Promise<void> {
    try {
      await prisma.$transaction(async (tx) => {
        // 1. Clean up expired reservations first
        await tx.cartelaReservation.deleteMany({
          where: {
            round_id: roundId,
            expires_at: { lt: new Date() }
          }
        });

        // 2. Check if cartela is already taken (permanently)
        const existingEntry = await tx.roundEntry.findUnique({
          where: { 
            round_id_cartela_number: { 
              round_id: roundId, 
              cartela_number: cartelaNumber 
            } 
          }
        });
        
        if (existingEntry) {
          throw new CartelaAlreadyReservedError(roundId, cartelaNumber);
        }

        // 3. Check if cartela is already reserved by someone else
        const existingReservation = await tx.cartelaReservation.findUnique({
          where: {
            round_id_cartela_number: {
              round_id: roundId,
              cartela_number: cartelaNumber
            }
          }
        });

        if (existingReservation && existingReservation.player_id !== playerId) {
          throw new CartelaAlreadyReservedError(roundId, cartelaNumber, existingReservation.player_id);
        }

        // 4. If this is a new reservation (not extending existing one), check MAX_SELECT limit
        if (!existingReservation) {
          // Count player's current reservations + joined cartelas
          const [currentReservations, joinedCartelas] = await Promise.all([
            tx.cartelaReservation.count({
              where: {
                round_id: roundId,
                player_id: playerId
              }
            }),
            tx.roundEntry.count({
              where: {
                round_id: roundId,
                player_id: playerId,
                is_watching: false
              }
            })
          ]);

          const totalCartelaCount = currentReservations + joinedCartelas;
          
          if (totalCartelaCount >= MAX_SELECT) {
            throw new MaxCartelaLimitExceededError(roundId, playerId, totalCartelaCount);
          }
        }

        // 5. Create or update reservation
        const expiresAt = new Date(Date.now() + RESERVATION_DURATION_MS);
        
        await tx.cartelaReservation.upsert({
          where: {
            round_id_cartela_number: {
              round_id: roundId,
              cartela_number: cartelaNumber
            }
          },
          update: {
            expires_at: expiresAt
          },
          create: {
            round_id: roundId,
            player_id: playerId,
            cartela_number: cartelaNumber,
            expires_at: expiresAt
          }
        });
      });
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === 'P2002') {
        throw new CartelaAlreadyReservedError(roundId, cartelaNumber);
      }
      throw err;
    }
  },

  /**
   * Release a reservation for a cartela.
   */
  async release(roundId: string, playerId: string, cartelaNumber: number): Promise<void> {
    const deletedCount = await prisma.cartelaReservation.deleteMany({
      where: {
        round_id: roundId,
        player_id: playerId,
        cartela_number: cartelaNumber
      }
    });

    if (deletedCount.count === 0) {
      throw new ReservationNotFoundError(roundId, cartelaNumber, playerId);
    }
  },

  /**
   * Release all reservations for a player in a round.
   */
  async releaseAll(roundId: string, playerId: string): Promise<number[]> {
    const reservations = await prisma.cartelaReservation.findMany({
      where: {
        round_id: roundId,
        player_id: playerId
      },
      select: { cartela_number: true }
    });

    await prisma.cartelaReservation.deleteMany({
      where: {
        round_id: roundId,
        player_id: playerId
      }
    });

    return reservations.map(r => r.cartela_number);
  },

  /**
   * Get all cartelas reserved by a player in a round.
   */
  async getPlayerReservations(roundId: string, playerId: string): Promise<number[]> {
    await prisma.cartelaReservation.deleteMany({
      where: {
        round_id: roundId,
        expires_at: { lt: new Date() }
      }
    });

    const reservations = await prisma.cartelaReservation.findMany({
      where: {
        round_id: roundId,
        player_id: playerId
      },
      select: { cartela_number: true }
    });

    return reservations.map(r => r.cartela_number);
  },

  /**
   * Get all taken/reserved cartela numbers for a round (for availability check).
   */
  async getTakenAndReserved(roundId: string): Promise<{ taken: number[], reserved: number[] }> {
    // Clean up expired reservations first
    await prisma.cartelaReservation.deleteMany({
      where: {
        round_id: roundId,
        expires_at: { lt: new Date() }
      }
    });

    const [takenEntries, reservations] = await Promise.all([
      prisma.roundEntry.findMany({
        where: { round_id: roundId, is_watching: false },
        select: { cartela_number: true }
      }),
      prisma.cartelaReservation.findMany({
        where: { round_id: roundId },
        select: { cartela_number: true }
      })
    ]);

    return {
      taken: takenEntries.map(e => e.cartela_number),
      reserved: reservations.map(r => r.cartela_number)
    };
  },

  /**
   * Clean up expired reservations (can be called periodically).
   */
  async cleanupExpired(): Promise<number> {
    const result = await prisma.cartelaReservation.deleteMany({
      where: {
        expires_at: { lt: new Date() }
      }
    });
    
    return result.count;
  }
};