// DB Enum types — mirror the PostgreSQL ENUM definitions

export type WalletType = 'main' | 'play';

export type TxType =
  | 'deposit'
  | 'withdrawal'
  | 'game_entry'
  | 'game_win'
  | 'referral_commission'
  | 'admin_credit'
  | 'admin_debit'
  | 'refund';

export type GameStatus = 'pending' | 'active' | 'completed' | 'cancelled' | 'void';

export type AdminRole = 'admin' | 'super_admin';
