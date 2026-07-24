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
