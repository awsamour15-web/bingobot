// DB Enum types — mirror the PostgreSQL ENUM definitions

export type WalletType = 'main' | 'play';
export const WalletType = {
  main: 'main' as WalletType,
  play: 'play' as WalletType,
};

export type TxType =
  | 'deposit'
  | 'withdrawal'
  | 'game_entry'
  | 'game_win'
  | 'referral_commission'
  | 'admin_credit'
  | 'admin_debit'
  | 'refund';
export const TxType = {
  deposit: 'deposit' as TxType,
  withdrawal: 'withdrawal' as TxType,
  game_entry: 'game_entry' as TxType,
  game_win: 'game_win' as TxType,
  referral_commission: 'referral_commission' as TxType,
  admin_credit: 'admin_credit' as TxType,
  admin_debit: 'admin_debit' as TxType,
  refund: 'refund' as TxType,
};

export type GameStatus = 'pending' | 'active' | 'completed' | 'cancelled' | 'void';
export const GameStatus = {
  pending: 'pending' as GameStatus,
  active: 'active' as GameStatus,
  completed: 'completed' as GameStatus,
  cancelled: 'cancelled' as GameStatus,
  void: 'void' as GameStatus,
};

export type AdminRole = 'admin' | 'super_admin';
export const AdminRole = {
  admin: 'admin' as AdminRole,
  super_admin: 'super_admin' as AdminRole,
};

// Winning patterns for bingo rounds
export type WinPattern =
  | 'any_line'        // any single row, column, or diagonal
  | 'row'             // any single row
  | 'column'          // any single column
  | 'diagonal_tl_br'  // top-left → bottom-right diagonal (indices 0,6,12,18,24)
  | 'diagonal_tr_bl'  // top-right → bottom-left diagonal (indices 4,8,12,16,20)
  | 'corners'         // 4 corners only (indices 0,4,20,24)
  | 'full_house';     // all 25 cells (blackout)

export const WinPattern = {
  any_line:       'any_line'       as WinPattern,
  row:            'row'            as WinPattern,
  column:         'column'         as WinPattern,
  diagonal_tl_br: 'diagonal_tl_br' as WinPattern,
  diagonal_tr_bl: 'diagonal_tr_bl' as WinPattern,
  corners:        'corners'        as WinPattern,
  full_house:     'full_house'     as WinPattern,
};

/** Human-readable label for display */
export const WIN_PATTERN_LABELS: Record<WinPattern, string> = {
  any_line:       'Any Line',
  row:            'Any Row',
  column:         'Any Column',
  diagonal_tl_br: 'Diagonal ↘',
  diagonal_tr_bl: 'Diagonal ↙',
  corners:        '4 Corners',
  full_house:     'Full House',
};
