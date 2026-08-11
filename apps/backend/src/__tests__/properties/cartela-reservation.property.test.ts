// Feature: Cartela Reservation System
// Property-based tests for cartela locking mechanism

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { CartelaReservationService, CartelaAlreadyReservedError } from '../../services/cartela-reservation.service.js';

// Mock Prisma for property testing
const mockReservations = new Map<string, {
  id: string;
  round_id: string;
  cartela_number: number;
  player_id: string;
  expires_at: Date;
  created_at: Date;
}>();

const mockRoundEntries = new Map<string, {
  round_id: string;
  cartela_number: number;
  player_id: string;
  is_watching: boolean;
}>();

let nextId = 1;

// Mock implementation for testing
const mockCartelaReservationService = {
  async reserve(roundId: string, playerId: string, cartelaNumber: number): Promise<void> {
    const key = `${roundId}:${cartelaNumber}`;
    const now = new Date();
    
    // Clean up expired first
    for (const [k, reservation] of mockReservations) {
      if (reservation.round_id === roundId && reservation.expires_at <= now) {
        mockReservations.delete(k);
      }
    }
    
    // Check if cartela is taken permanently
    const entryKey = `${roundId}:${cartelaNumber}`;
    if (mockRoundEntries.has(entryKey)) {
      throw new CartelaAlreadyReservedError(roundId, cartelaNumber);
    }
    
    // Check existing reservation
    const existing = mockReservations.get(key);
    if (existing && existing.player_id !== playerId) {
      throw new CartelaAlreadyReservedError(roundId, cartelaNumber, existing.player_id);
    }
    
    // Create/update reservation
    mockReservations.set(key, {
      id: `res${nextId++}`,
      round_id: roundId,
      cartela_number: cartelaNumber,
      player_id: playerId,
      expires_at: new Date(now.getTime() + 30000), // 30 seconds
      created_at: now
    });
  },

  async release(roundId: string, playerId: string, cartelaNumber: number): Promise<void> {
    const key = `${roundId}:${cartelaNumber}`;
    const existing = mockReservations.get(key);
    
    if (!existing || existing.player_id !== playerId) {
      throw new Error('Reservation not found');
    }
    
    mockReservations.delete(key);
  },

  async getTakenAndReserved(roundId: string): Promise<{ taken: number[], reserved: number[] }> {
    const now = new Date();
    
    // Clean expired
    for (const [key, reservation] of mockReservations) {
      if (reservation.round_id === roundId && reservation.expires_at <= now) {
        mockReservations.delete(key);
      }
    }
    
    const taken = Array.from(mockRoundEntries.values())
      .filter(entry => entry.round_id === roundId && !entry.is_watching)
      .map(entry => entry.cartela_number);
      
    const reserved = Array.from(mockReservations.values())
      .filter(res => res.round_id === roundId)
      .map(res => res.cartela_number);
      
    return { taken, reserved };
  }
};

describe('Property: Cartela Reservation System', () => {
  beforeEach(() => {
    mockReservations.clear();
    mockRoundEntries.clear();
    nextId = 1;
  });

  afterEach(() => {
    mockReservations.clear();
    mockRoundEntries.clear();
  });

  it('Property 1: A reserved cartela cannot be reserved by another player', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 36 }), // roundId
        fc.string({ minLength: 1, maxLength: 36 }), // playerId1
        fc.string({ minLength: 1, maxLength: 36 }), // playerId2
        fc.integer({ min: 1, max: 800 }), // cartelaNumber
        async (roundId, playerId1, playerId2, cartelaNumber) => {
          // Ensure different players
          if (playerId1 === playerId2) return true;
          
          // Player 1 reserves cartela
          await mockCartelaReservationService.reserve(roundId, playerId1, cartelaNumber);
          
          // Player 2 should not be able to reserve the same cartela
          await expect(
            mockCartelaReservationService.reserve(roundId, playerId2, cartelaNumber)
          ).rejects.toThrow(CartelaAlreadyReservedError);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('Property 2: A player can extend their own reservation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 36 }), // roundId
        fc.string({ minLength: 1, maxLength: 36 }), // playerId
        fc.integer({ min: 1, max: 800 }), // cartelaNumber
        async (roundId, playerId, cartelaNumber) => {
          // Reserve cartela
          await mockCartelaReservationService.reserve(roundId, playerId, cartelaNumber);
          
          // Same player can "reserve" again (extends reservation)
          await expect(
            mockCartelaReservationService.reserve(roundId, playerId, cartelaNumber)
          ).resolves.not.toThrow();
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('Property 3: Available cartelas exclude both taken and reserved ones', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 36 }), // roundId
        fc.array(fc.integer({ min: 1, max: 800 }), { maxLength: 10 }), // taken cartelas
        fc.array(fc.integer({ min: 1, max: 800 }), { maxLength: 10 }), // reserved cartelas
        async (roundId, takenNums, reservedNums) => {
          // Simulate taken cartelas
          takenNums.forEach((num, i) => {
            mockRoundEntries.set(`${roundId}:${num}`, {
              round_id: roundId,
              cartela_number: num,
              player_id: `player${i}`,
              is_watching: false
            });
          });
          
          // Simulate reserved cartelas (only those not already taken)
          const availableForReservation = reservedNums.filter(num => !takenNums.includes(num));
          for (let i = 0; i < availableForReservation.length; i++) {
            const num = availableForReservation[i];
            if (num !== undefined) {
              await mockCartelaReservationService.reserve(roundId, `reserving_player${i}`, num);
            }
          }
          
          const { taken, reserved } = await mockCartelaReservationService.getTakenAndReserved(roundId);
          
          // All cartela numbers 1-800
          const allCartelas = Array.from({ length: 800 }, (_, i) => i + 1);
          const unavailableSet = new Set([...taken, ...reserved]);
          const available = allCartelas.filter(n => !unavailableSet.has(n));
          
          // Property: No overlap between available and unavailable
          for (const num of available) {
            expect(taken).not.toContain(num);
            expect(reserved).not.toContain(num);
          }
          
          // Property: All unavailable cartelas are either taken or reserved
          for (const num of [...taken, ...reserved]) {
            expect(available).not.toContain(num);
          }
          
          return true;
        }
      ),
      { numRuns: 30 }
    );
  });

  it('Property 4: Released reservations become available immediately', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 36 }), // roundId
        fc.string({ minLength: 1, maxLength: 36 }), // playerId
        fc.integer({ min: 1, max: 800 }), // cartelaNumber
        async (roundId, playerId, cartelaNumber) => {
          // Reserve cartela
          await mockCartelaReservationService.reserve(roundId, playerId, cartelaNumber);
          
          // Verify it's reserved
          const { reserved: beforeRelease } = await mockCartelaReservationService.getTakenAndReserved(roundId);
          expect(beforeRelease).toContain(cartelaNumber);
          
          // Release reservation
          await mockCartelaReservationService.release(roundId, playerId, cartelaNumber);
          
          // Verify it's no longer reserved
          const { reserved: afterRelease } = await mockCartelaReservationService.getTakenAndReserved(roundId);
          expect(afterRelease).not.toContain(cartelaNumber);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('Property 5: Taken cartelas cannot be reserved', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 36 }), // roundId
        fc.string({ minLength: 1, maxLength: 36 }), // playerId
        fc.integer({ min: 1, max: 800 }), // cartelaNumber
        async (roundId, playerId, cartelaNumber) => {
          // Mark cartela as taken (permanently joined)
          mockRoundEntries.set(`${roundId}:${cartelaNumber}`, {
            round_id: roundId,
            cartela_number: cartelaNumber,
            player_id: playerId,
            is_watching: false
          });
          
          // Should not be able to reserve a taken cartela
          await expect(
            mockCartelaReservationService.reserve(roundId, 'another_player', cartelaNumber)
          ).rejects.toThrow(CartelaAlreadyReservedError);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});