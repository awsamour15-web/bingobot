import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProfile, playMinesweeper, cashoutMinesweeper, getMinesweeperHistory } from '../lib/api';

type GameState = 'betting' | 'playing' | 'won' | 'lost';

interface Cell {
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
}

interface HistoryEntry {
  id: string;
  betAmount: number;
  mineCount: number;
  cellsRevealed: number;
  multiplier: number;
  payout: number;
  result: 'win' | 'loss';
  createdAt: string;
}

const GRID_SIZE = 5; // 5x5 grid
const MAX_MINES = 20;

// Multiplier table based on mines revealed
function calculateMultiplier(mineCount: number, cellsRevealed: number): number {
  if (cellsRevealed === 0) return 1;
  const totalCells = GRID_SIZE * GRID_SIZE;
  const safeCells = totalCells - mineCount;
  
  let multiplier = 1;
  for (let i = 0; i < cellsRevealed; i++) {
    multiplier *= (totalCells - i) / (safeCells - i);
  }
  return Math.round(multiplier * 100) / 100;
}

const MINE_PRESETS = [
  { mines: 3, label: '3 Mines', risk: 'Low', color: '#22c55e' },
  { mines: 5, label: '5 Mines', risk: 'Medium', color: '#eab308' },
  { mines: 7, label: '7 Mines', risk: 'High', color: '#ef4444' },
  { mines: 10, label: '10 Mines', risk: 'Extreme', color: '#dc2626' },
];

export default function MinesweeperScreen() {
  const navigate = useNavigate();
  
  const [mainBalance, setMainBalance] = useState<number | null>(null);
  const [playBalance, setPlayBalance] = useState<number | null>(null);
  const [walletType, setWalletType] = useState<'main' | 'play'>('play');
  
  const [bet, setBet] = useState(10);
  const [mineCount, setMineCount] = useState(3);
  const [gameState, setGameState] = useState<GameState>('betting');
  const [gameId, setGameId] = useState<string | null>(null);
  const [grid, setGrid] = useState<Cell[][]>([]);
  const [cellsRevealed, setCellsRevealed] = useState(0);
  const [currentMultiplier, setCurrentMultiplier] = useState(1);
  const [potentialWin, setPotentialWin] = useState(0);
  const [lastPayout, setLastPayout] = useState<number | null>(null);
  
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [tab, setTab] = useState<'game' | 'history'>('game');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Load profile
  useEffect(() => {
    getProfile().then(p => {
      setMainBalance(p.mainWallet.balance);
      setPlayBalance(p.playWallet.balance);
    }).catch(() => {});
  }, []);

  // Load history when tab switches
  useEffect(() => {
    if (tab === 'history') {
      getMinesweeperHistory().then(setHistory).catch(() => {});
    }
  }, [tab]);

  // Calculate potential win
  useEffect(() => {
    setPotentialWin(Math.round(bet * currentMultiplier * 100) / 100);
  }, [bet, currentMultiplier]);

  const initializeGrid = useCallback((mines: number, seed?: string): Cell[][] => {
    const totalCells = GRID_SIZE * GRID_SIZE;
    const newGrid: Cell[][] = Array(GRID_SIZE).fill(null).map(() =>
      Array(GRID_SIZE).fill(null).map(() => ({
        isMine: false,
        isRevealed: false,
        isFlagged: false,
      }))
    );

    // Place mines randomly
    const minePositions = new Set<number>();
    while (minePositions.size < mines) {
      minePositions.add(Math.floor(Math.random() * totalCells));
    }

    minePositions.forEach(pos => {
      const row = Math.floor(pos / GRID_SIZE);
      const col = pos % GRID_SIZE;
      newGrid[row]![col]!.isMine = true;
    });

    return newGrid;
  }, []);

  const startGame = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await playMinesweeper(bet, mineCount, walletType);
      setGameId(result.gameId);
      setGrid(initializeGrid(mineCount));
      setCellsRevealed(0);
      setCurrentMultiplier(1);
      setGameState('playing');
      setLastPayout(null);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to start game');
    } finally {
      setLoading(false);
    }
  };

  const revealCell = (row: number, col: number) => {
    const cell = grid[row]?.[col];
    if (gameState !== 'playing' || !cell || cell.isRevealed) return;

    const newGrid = grid.map(r => r.map(c => ({ ...c })));
    const targetCell = newGrid[row]?.[col];
    if (!targetCell) return;

    targetCell.isRevealed = true;
    setGrid(newGrid);

    if (targetCell.isMine) {
      // Game over - hit a mine
      setGameState('lost');
      setLastPayout(0);
      return;
    }

    const newCellsRevealed = cellsRevealed + 1;
    setCellsRevealed(newCellsRevealed);
    const newMultiplier = calculateMultiplier(mineCount, newCellsRevealed);
    setCurrentMultiplier(newMultiplier);

    // Check if all safe cells revealed
    const totalCells = GRID_SIZE * GRID_SIZE;
    const safeCells = totalCells - mineCount;
    if (newCellsRevealed === safeCells) {
      // Auto cashout - won everything
      handleCashout(newGrid, newCellsRevealed);
    }
  };

  const handleCashout = async (currentGrid?: Cell[][], revealedCount?: number) => {
    if (!gameId || gameState !== 'playing') return;
    
    setLoading(true);
    try {
      const result = await cashoutMinesweeper(gameId);
      setLastPayout(result.payout);
      setGameState('won');
      
      // Refresh balance
      getProfile().then(p => {
        setMainBalance(p.mainWallet.balance);
        setPlayBalance(p.playWallet.balance);
      }).catch(() => {});
    } catch (err: any) {
      setError(err?.message ?? 'Failed to cashout');
    } finally {
      setLoading(false);
    }
  };

  const resetGame = () => {
    setGameState('betting');
    setGameId(null);
    setGrid([]);
    setCellsRevealed(0);
    setCurrentMultiplier(1);
    setLastPayout(null);
    setError(null);
  };

  const getCellColor = (cell: Cell, row: number, col: number) => {
    if (!cell.isRevealed) return 'rgba(255,255,255,0.1)';
    if (cell.isMine) return '#ef4444';
    return 'rgba(34,197,94,0.3)';
  };

  const getCellContent = (cell: Cell) => {
    if (!cell.isRevealed) return '❓';
    if (cell.isMine) return '💣';
    return '💎';
  };

  return (
    <div style={{ minHeight: '100dvh', background: '#060b18', color: '#f8fafc', fontFamily: "'Inter',sans-serif", display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        <button onClick={() => navigate('/')} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 10, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>← Back</button>
        <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.3px' }}>💣 Minesweeper Casino</span>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, color: '#475569', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Balance</div>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#4ade80' }}>M: {mainBalance !== null ? mainBalance.toFixed(2) : '—'}</div>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#818cf8' }}>P: {playBalance !== null ? playBalance.toFixed(2) : '—'}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        {(['game', 'history'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '10px 0', background: 'none', border: 'none', borderBottom: tab === t ? '2px solid #f59e0b' : '2px solid transparent', color: tab === t ? '#f59e0b' : '#475569', fontSize: 12, fontWeight: 800, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {t === 'game' ? '💣 Game' : '📋 History'}
          </button>
        ))}
      </div>

      {tab === 'history' ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: '#475569' }}>No history yet</div>
          ) : (
            history.map(item => (
              <div key={item.id} style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#e2e8f0' }}>{item.mineCount} mines · {item.cellsRevealed} revealed · {item.multiplier}x</div>
                  <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>{new Date(item.createdAt).toLocaleString()} · Bet {item.betAmount} ETB</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 900, color: item.result === 'win' ? '#4ade80' : '#f87171' }}>
                  {item.result === 'win' ? '+' : ''}{(item.payout - item.betAmount).toFixed(2)} ETB
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: '16px' }}>

          {/* Result banner */}
          {(gameState === 'won' || gameState === 'lost') && lastPayout !== null && (
            <div style={{ 
              marginBottom: 16, 
              padding: '16px', 
              borderRadius: 12, 
              background: gameState === 'won' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)', 
              border: `1px solid ${gameState === 'won' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.25)'}`,
              textAlign: 'center'
            }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: gameState === 'won' ? '#4ade80' : '#f87171' }}>
                {gameState === 'won' ? `🎉 You Won ${lastPayout.toFixed(2)} ETB!` : '💥 You hit a mine!'}
              </div>
              <div style={{ fontSize: 14, color: '#94a3b8', marginTop: 4 }}>
                {currentMultiplier}x multiplier · {cellsRevealed} cells revealed
              </div>
            </div>
          )}

          {error && (
            <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 12, color: '#f87171' }}>{error}</div>
          )}

          {/* Game Grid */}
          {gameState === 'playing' && grid.length > 0 && (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`, 
              gap: 8, 
              marginBottom: 16,
              padding: 16,
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.06)'
            }}>
              {grid.map((row, rowIndex) =>
                row.map((cell, colIndex) => (
                  <button
                    key={`${rowIndex}-${colIndex}`}
                    onClick={() => revealCell(rowIndex, colIndex)}
                    disabled={cell.isRevealed}
                    style={{
                      aspectRatio: '1',
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: getCellColor(cell, rowIndex, colIndex),
                      fontSize: 20,
                      cursor: cell.isRevealed ? 'default' : 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {getCellContent(cell)}
                  </button>
                ))
              )}
            </div>
          )}

          {/* Multiplier Display */}
          {gameState === 'playing' && (
            <div style={{ 
              textAlign: 'center', 
              marginBottom: 16,
              padding: 16,
              background: 'rgba(245,158,11,0.1)',
              borderRadius: 12,
              border: '1px solid rgba(245,158,11,0.2)'
            }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#f59e0b' }}>{currentMultiplier}x</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Potential Win: {potentialWin.toFixed(2)} ETB</div>
            </div>
          )}

          {/* Controls */}
          {gameState === 'betting' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              
              {/* Wallet selector */}
              <div>
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Pay From</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setWalletType('main')} style={{ flex: 1, padding: '10px 0', borderRadius: 8, background: walletType === 'main' ? '#4ade80' : 'rgba(255,255,255,0.06)', border: `1px solid ${walletType === 'main' ? '#4ade80' : 'rgba(255,255,255,0.1)'}`, color: walletType === 'main' ? '#fff' : '#94a3b8', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                    Main {mainBalance !== null ? `(${mainBalance.toFixed(2)})` : ''}
                  </button>
                  <button onClick={() => setWalletType('play')} style={{ flex: 1, padding: '10px 0', borderRadius: 8, background: walletType === 'play' ? '#818cf8' : 'rgba(255,255,255,0.06)', border: `1px solid ${walletType === 'play' ? '#818cf8' : 'rgba(255,255,255,0.1)'}`, color: walletType === 'play' ? '#fff' : '#94a3b8', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                    Play {playBalance !== null ? `(${playBalance.toFixed(2)})` : ''}
                  </button>
                </div>
              </div>

              {/* Mine count selector */}
              <div>
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Number of Mines</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {MINE_PRESETS.map(preset => (
                    <button 
                      key={preset.mines} 
                      onClick={() => setMineCount(preset.mines)} 
                      style={{ 
                        padding: '10px', 
                        borderRadius: 8, 
                        background: mineCount === preset.mines ? preset.color + '33' : 'rgba(255,255,255,0.06)', 
                        border: `1px solid ${mineCount === preset.mines ? preset.color : 'rgba(255,255,255,0.1)'}`, 
                        color: mineCount === preset.mines ? preset.color : '#94a3b8', 
                        fontSize: 12, 
                        fontWeight: 800, 
                        cursor: 'pointer',
                        textAlign: 'center'
                      }}
                    >
                      <div>{preset.label}</div>
                      <div style={{ fontSize: 10, opacity: 0.8 }}>{preset.risk} Risk</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Bet amount */}
              <div>
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Bet (ETB)</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                  <button onClick={() => setBet(b => Math.max(5, b - 5))} style={{ width: 44, height: 44, borderRadius: '8px 0 0 8px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRight: 'none', color: '#fff', fontSize: 20, cursor: 'pointer' }}>−</button>
                  <input
                    type="number" value={bet} min={5} max={10000}
                    onChange={e => setBet(Math.min(10000, Math.max(5, Number(e.target.value) || 5)))}
                    style={{ flex: 1, height: 44, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', borderLeft: 'none', borderRight: 'none', color: '#fff', fontSize: 16, fontWeight: 800, textAlign: 'center', outline: 'none' }}
                  />
                  <button onClick={() => setBet(b => Math.min(10000, b + 5))} style={{ width: 44, height: 44, borderRadius: '0 8px 8px 0', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderLeft: 'none', color: '#fff', fontSize: 20, cursor: 'pointer' }}>+</button>
                  <button onClick={() => setBet(b => Math.min(10000, b * 2))} style={{ marginLeft: 6, padding: '0 12px', height: 44, borderRadius: 8, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#94a3b8', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>x2</button>
                  <button onClick={() => setBet(10000)} style={{ marginLeft: 4, padding: '0 12px', height: 44, borderRadius: 8, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#94a3b8', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>MAX</button>
                </div>
              </div>

              {/* Start button */}
              <button
                onClick={startGame}
                disabled={loading}
                style={{ width: '100%', height: 52, borderRadius: 14, background: loading ? 'rgba(245,158,11,0.3)' : 'linear-gradient(135deg,#f59e0b,#d97706)', border: 'none', color: '#fff', fontSize: 16, fontWeight: 900, cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '-0.2px' }}
              >
                {loading ? 'Starting...' : '💣 Start Game'}
              </button>
            </div>
          )}

          {/* Cashout button */}
          {gameState === 'playing' && cellsRevealed > 0 && (
            <button
              onClick={() => handleCashout()}
              disabled={loading}
              style={{ width: '100%', height: 52, borderRadius: 14, background: loading ? 'rgba(34,197,94,0.3)' : 'linear-gradient(135deg,#22c55e,#16a34a)', border: 'none', color: '#fff', fontSize: 16, fontWeight: 900, cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '-0.2px' }}
            >
              {loading ? 'Cashing out...' : `💰 Cashout ${potentialWin.toFixed(2)} ETB`}
            </button>
          )}

          {/* Play again button */}
          {(gameState === 'won' || gameState === 'lost') && (
            <button
              onClick={resetGame}
              style={{ width: '100%', height: 52, borderRadius: 14, background: 'linear-gradient(135deg,#f59e0b,#d97706)', border: 'none', color: '#fff', fontSize: 16, fontWeight: 900, cursor: 'pointer', letterSpacing: '-0.2px' }}
            >
              🔄 Play Again
            </button>
          )}

          {/* Info */}
          <div style={{ marginTop: 16, padding: 12, background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, lineHeight: 1.6 }}>
              💎 Reveal safe cells to increase your multiplier<br/>
              💣 Hit a mine and lose your bet<br/>
              💰 Cashout anytime to secure your winnings<br/>
              🎯 Reveal all safe cells for maximum payout!
            </div>
          </div>
        </div>
      )}
    </div>
  );
}