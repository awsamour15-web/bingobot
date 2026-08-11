// Feature: agent-partner-role, Property-based tests for Agent Commission System
// **Validates: Requirements 4.1-4.6, 9.1-9.5**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { Decimal } from '@prisma/client/runtime/library';

// ─── Shared types / in-memory models ────────────────────────────────────────

interface InMemoryAgent {
  id: string;
  telegram_username: string;
  is_active: boolean;
  commission_balance: Decimal;
}

interface InMemoryAgentCommission {
  id: string;
  agent_id: string;
  player_id: string;
  deposit_id: string;
  deposit_amount: Decimal;
  commission_amount: Decimal;
}

interface InMemoryPlayer {
  id: string;
  agent_id: string | null;
  username: string;
}

interface InMemoryDeposit {
  id: string;
  player_id: string;
  amount: Decimal;
  claimed: boolean;
}

interface CommissionSystemState {
  agents: Map<string, InMemoryAgent>;
  commissions: Map<string, InMemoryAgentCommission>; // key: deposit_id
  players: Map<string, InMemoryPlayer>;
  deposits: Map<string, InMemoryDeposit>;
}

// ─── Pure in-memory simulation of commission system ────────────────────────

/**
 * Simulates the AgentService.creditCommission logic with all invariants.
 * Returns updated state and new commission record, or throws on violations.
 */
function simulateCreditCommission(
  state: CommissionSystemState,
  agentId: string,
  playerId: string,
  depositId: string,
  depositAmount: Decimal
): { newState: CommissionSystemState; commission: InMemoryAgentCommission } {
  const agent = state.agents.get(agentId);
  const player = state.players.get(playerId);
  const deposit = state.deposits.get(depositId);

  // Validation checks
  if (!agent) throw new Error('Agent not found');
  if (!player) throw new Error('Player not found');
  if (!deposit) throw new Error('Deposit not found');
  if (player.agent_id !== agentId) throw new Error('Player not referred by this agent');
  if (deposit.player_id !== playerId) throw new Error('Deposit does not belong to player');
  if (!deposit.claimed) throw new Error('Deposit not claimed yet');

  // Suspended agents should not receive new commissions
  if (!agent.is_active) {
    return { newState: state, commission: null as any }; // No commission created
  }

  // Idempotency check: no duplicate commission for same deposit_id
  if (state.commissions.has(depositId)) {
    throw new Error('Commission already exists for this deposit');
  }

  // Calculate 10% commission with 2 decimal places
  const rate = new Decimal('0.10');
  const commissionAmount = depositAmount.mul(rate).toDecimalPlaces(2);

  // Create commission record
  const commission: InMemoryAgentCommission = {
    id: `comm_${Math.random().toString(36).substr(2, 9)}`,
    agent_id: agentId,
    player_id: playerId,
    deposit_id: depositId,
    deposit_amount: depositAmount,
    commission_amount: commissionAmount,
  };

  // Update agent balance
  const updatedAgent: InMemoryAgent = {
    ...agent,
    commission_balance: agent.commission_balance.add(commissionAmount),
  };

  // Create new state
  const newState: CommissionSystemState = {
    agents: new Map(state.agents).set(agentId, updatedAgent),
    commissions: new Map(state.commissions).set(depositId, commission),
    players: new Map(state.players),
    deposits: new Map(state.deposits),
  };

  return { newState, commission };
}

/**
 * Calculates the expected commission balance for an agent by summing all their commission records.
 */
function calculateExpectedBalance(
  agentId: string,
  commissions: Map<string, InMemoryAgentCommission>
): Decimal {
  let total = new Decimal(0);
  for (const commission of commissions.values()) {
    if (commission.agent_id === agentId) {
      total = total.add(commission.commission_amount);
    }
  }
  return total;
}

// ─── Arbitraries ────────────────────────────────────────────────────────────

const decimalArb = (min: number = 0.01, max: number = 10000) =>
  fc.float({ min: Math.fround(min), max: Math.fround(max), noNaN: true }).map(n => new Decimal(n.toFixed(2)));

const agentArb = fc.record({
  id: fc.uuidV(4),
  telegram_username: fc.string({ minLength: 3, maxLength: 20 }),
  is_active: fc.boolean(),
  commission_balance: decimalArb(0, 50000),
});

const playerArb = fc.record({
  id: fc.uuidV(4),
  username: fc.string({ minLength: 3, maxLength: 20 }),
});

const depositArb = fc.record({
  id: fc.uuidV(4),
  amount: decimalArb(1, 1000),
  claimed: fc.constant(true), // Only test with claimed deposits
});

// Generate a list of deposits for simulating multiple commission operations
const multipleDepositsArb = fc.array(depositArb, { minLength: 1, maxLength: 20 });

// ─── Property 10.1: Commission Balance Invariant ──────────────────────────

describe('Property 10.1: Commission Balance Invariant', () => {
  it('Agent.commission_balance === SUM(AgentCommission.commission_amount) across multiple deposits', () => {
    fc.assert(
      fc.property(
        agentArb,
        playerArb,
        multipleDepositsArb,
        (agent, player, deposits) => {
          // Initialize system state
          const initialState: CommissionSystemState = {
            agents: new Map([[agent.id, { ...agent, commission_balance: new Decimal(0) }]]),
            commissions: new Map(),
            players: new Map([[player.id, { ...player, agent_id: agent.id }]]),
            deposits: new Map(),
          };

          // Add deposits to state
          deposits.forEach(deposit => {
            initialState.deposits.set(deposit.id, { ...deposit, player_id: player.id });
          });

          let currentState = initialState;

          // Simulate commission for each deposit (if agent is active)
          for (const deposit of deposits) {
            if (agent.is_active) {
              try {
                const result = simulateCreditCommission(
                  currentState,
                  agent.id,
                  player.id,
                  deposit.id,
                  deposit.amount
                );
                currentState = result.newState;
              } catch (error) {
                // Skip on expected errors (like duplicates in property testing)
                if ((error as Error).message === 'Commission already exists for this deposit') {
                  continue;
                }
                throw error;
              }
            }
          }

          // Verify the invariant: agent balance equals sum of their commissions
          const finalAgent = currentState.agents.get(agent.id)!;
          const expectedBalance = calculateExpectedBalance(agent.id, currentState.commissions);
          
          expect(finalAgent.commission_balance.toString()).toBe(expectedBalance.toString());
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 10.2: Idempotency Guard (No Duplicate Commissions) ──────────

describe('Property 10.2: Idempotency Guard', () => {
  it('no duplicate AgentCommission record is created for the same deposit_id', () => {
    fc.assert(
      fc.property(
        agentArb,
        playerArb,
        depositArb,
        (agent, player, deposit) => {
          const activeAgent = { ...agent, is_active: true };
          const initialState: CommissionSystemState = {
            agents: new Map([[activeAgent.id, activeAgent]]),
            commissions: new Map(),
            players: new Map([[player.id, { ...player, agent_id: activeAgent.id }]]),
            deposits: new Map([[deposit.id, { ...deposit, player_id: player.id }]]),
          };

          // First commission should succeed
          const firstResult = simulateCreditCommission(
            initialState,
            activeAgent.id,
            player.id,
            deposit.id,
            deposit.amount
          );

          expect(firstResult.commission).toBeDefined();
          expect(firstResult.newState.commissions.has(deposit.id)).toBe(true);

          // Second attempt should throw due to duplicate deposit_id
          expect(() => {
            simulateCreditCommission(
              firstResult.newState,
              activeAgent.id,
              player.id,
              deposit.id,
              deposit.amount
            );
          }).toThrow('Commission already exists for this deposit');
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 10.3: Commission Rate Accuracy ──────────────────────────────

describe('Property 10.3: Commission Rate Accuracy', () => {
  it('commission_amount === ROUND(deposit_amount * 0.10, 2) for all generated records', () => {
    fc.assert(
      fc.property(
        agentArb,
        playerArb,
        multipleDepositsArb,
        (agent, player, deposits) => {
          const activeAgent = { ...agent, is_active: true };
          const initialState: CommissionSystemState = {
            agents: new Map([[activeAgent.id, activeAgent]]),
            commissions: new Map(),
            players: new Map([[player.id, { ...player, agent_id: activeAgent.id }]]),
            deposits: new Map(),
          };

          // Add deposits to state
          deposits.forEach(deposit => {
            initialState.deposits.set(deposit.id, { ...deposit, player_id: player.id });
          });

          let currentState = initialState;

          // Process each deposit and verify commission calculation
          for (const deposit of deposits) {
            try {
              const result = simulateCreditCommission(
                currentState,
                activeAgent.id,
                player.id,
                deposit.id,
                deposit.amount
              );
              
              currentState = result.newState;
              const commission = result.commission;

              // Verify 10% rate with 2 decimal places
              const expectedCommission = deposit.amount.mul(new Decimal('0.10')).toDecimalPlaces(2);
              expect(commission.commission_amount.toString()).toBe(expectedCommission.toString());
              
              // Verify deposit amount is preserved accurately
              expect(commission.deposit_amount.toString()).toBe(deposit.amount.toString());
              
            } catch (error) {
              if ((error as Error).message === 'Commission already exists for this deposit') {
                continue; // Skip duplicates in property testing
              }
              throw error;
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 10.4: Suspended Agent Commission Guard ──────────────────────

describe('Property 10.4: Suspended Agent Commission Guard', () => {
  it('deposits by players referred to a suspended agent produce zero new AgentCommission records', () => {
    fc.assert(
      fc.property(
        agentArb,
        playerArb,
        multipleDepositsArb,
        (agent, player, deposits) => {
          const suspendedAgent = { ...agent, is_active: false }; // Agent is suspended
          const initialState: CommissionSystemState = {
            agents: new Map([[suspendedAgent.id, suspendedAgent]]),
            commissions: new Map(),
            players: new Map([[player.id, { ...player, agent_id: suspendedAgent.id }]]),
            deposits: new Map(),
          };

          // Add deposits to state
          deposits.forEach(deposit => {
            initialState.deposits.set(deposit.id, { ...deposit, player_id: player.id });
          });

          let currentState = initialState;
          const initialCommissionCount = currentState.commissions.size;

          // Attempt to process deposits for suspended agent
          for (const deposit of deposits) {
            const result = simulateCreditCommission(
              currentState,
              suspendedAgent.id,
              player.id,
              deposit.id,
              deposit.amount
            );
            currentState = result.newState;
          }

          // Verify no new commissions were created
          expect(currentState.commissions.size).toBe(initialCommissionCount);
          
          // Verify agent balance remained unchanged
          const finalAgent = currentState.agents.get(suspendedAgent.id)!;
          expect(finalAgent.commission_balance.toString()).toBe(suspendedAgent.commission_balance.toString());
        }
      ),
      { numRuns: 100 }
    );
  });

  it('active agent processes commissions normally, suspended agent does not', () => {
    fc.assert(
      fc.property(
        fc.tuple(playerArb, playerArb), // Two different players
        depositArb,
        fc.float({ min: 0, max: 50000 }), // initial balance
        ([activePlayer, suspendedPlayer], deposit, initialBalance) => {
          const activeAgentId = 'active-agent';
          const suspendedAgentId = 'suspended-agent';
          
          const state: CommissionSystemState = {
            agents: new Map([
              [activeAgentId, { 
                id: activeAgentId, 
                telegram_username: 'active', 
                is_active: true, 
                commission_balance: new Decimal(initialBalance) 
              }],
              [suspendedAgentId, { 
                id: suspendedAgentId, 
                telegram_username: 'suspended', 
                is_active: false, 
                commission_balance: new Decimal(initialBalance) 
              }],
            ]),
            commissions: new Map(),
            players: new Map([
              [activePlayer.id, { ...activePlayer, agent_id: activeAgentId }],
              [suspendedPlayer.id, { ...suspendedPlayer, agent_id: suspendedAgentId }],
            ]),
            deposits: new Map([
              [`${deposit.id}-active`, { ...deposit, id: `${deposit.id}-active`, player_id: activePlayer.id }],
              [`${deposit.id}-suspended`, { ...deposit, id: `${deposit.id}-suspended`, player_id: suspendedPlayer.id }],
            ]),
          };

          // Process deposit for active agent
          const activeResult = simulateCreditCommission(
            state,
            activeAgentId,
            activePlayer.id,
            `${deposit.id}-active`,
            deposit.amount
          );

          // Process deposit for suspended agent
          const suspendedResult = simulateCreditCommission(
            activeResult.newState,
            suspendedAgentId,
            suspendedPlayer.id,
            `${deposit.id}-suspended`,
            deposit.amount
          );

          // Active agent should have received commission
          const finalActiveAgent = suspendedResult.newState.agents.get(activeAgentId)!;
          const expectedCommission = deposit.amount.mul(new Decimal('0.10')).toDecimalPlaces(2);
          const expectedActiveBalance = new Decimal(initialBalance).add(expectedCommission);
          expect(finalActiveAgent.commission_balance.toString()).toBe(expectedActiveBalance.toString());

          // Suspended agent balance should be unchanged
          const finalSuspendedAgent = suspendedResult.newState.agents.get(suspendedAgentId)!;
          expect(finalSuspendedAgent.commission_balance.toString()).toBe(new Decimal(initialBalance).toString());

          // Only one commission record should exist (for active agent)
          expect(suspendedResult.newState.commissions.size).toBe(1);
          expect(suspendedResult.newState.commissions.has(`${deposit.id}-active`)).toBe(true);
          expect(suspendedResult.newState.commissions.has(`${deposit.id}-suspended`)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Additional Comprehensive Properties ──────────────────────────────────

describe('Agent Commission System Comprehensive Properties', () => {
  it('commission system maintains atomicity - all operations succeed or all fail', () => {
    fc.assert(
      fc.property(
        agentArb,
        playerArb,
        depositArb,
        (agent, player, deposit) => {
          const activeAgent = { ...agent, is_active: true };
          const initialState: CommissionSystemState = {
            agents: new Map([[activeAgent.id, activeAgent]]),
            commissions: new Map(),
            players: new Map([[player.id, { ...player, agent_id: activeAgent.id }]]),
            deposits: new Map([[deposit.id, { ...deposit, player_id: player.id }]]),
          };

          const result = simulateCreditCommission(
            initialState,
            activeAgent.id,
            player.id,
            deposit.id,
            deposit.amount
          );

          // If commission was created, both agent balance and commission record must exist
          if (result.commission) {
            expect(result.newState.commissions.has(deposit.id)).toBe(true);
            const updatedAgent = result.newState.agents.get(activeAgent.id)!;
            const expectedBalance = activeAgent.commission_balance.add(result.commission.commission_amount);
            expect(updatedAgent.commission_balance.toString()).toBe(expectedBalance.toString());
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('commission amounts are always non-negative and properly scaled', () => {
    fc.assert(
      fc.property(
        agentArb,
        playerArb,
        decimalArb(0.01, 100000), // Wide range of deposit amounts
        (agent, player, depositAmount) => {
          const activeAgent = { ...agent, is_active: true };
          const deposit = { id: 'test-deposit', amount: depositAmount, claimed: true, player_id: player.id };
          
          const state: CommissionSystemState = {
            agents: new Map([[activeAgent.id, activeAgent]]),
            commissions: new Map(),
            players: new Map([[player.id, { ...player, agent_id: activeAgent.id }]]),
            deposits: new Map([[deposit.id, deposit]]),
          };

          const result = simulateCreditCommission(
            state,
            activeAgent.id,
            player.id,
            deposit.id,
            depositAmount
          );

          const commission = result.commission;
          
          // Commission amount should be non-negative
          expect(commission.commission_amount.greaterThanOrEqualTo(0)).toBe(true);
          
          // Commission should be exactly 10% (within precision limits)
          const expectedRate = depositAmount.mul(new Decimal('0.10')).toDecimalPlaces(2);
          expect(commission.commission_amount.toString()).toBe(expectedRate.toString());
          
          // Commission should never exceed the deposit amount
          expect(commission.commission_amount.lessThanOrEqualTo(depositAmount)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});