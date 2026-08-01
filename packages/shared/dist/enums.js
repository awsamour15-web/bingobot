// DB Enum types — mirror the PostgreSQL ENUM definitions
export const WalletType = {
    main: 'main',
    play: 'play',
};
export const TxType = {
    deposit: 'deposit',
    withdrawal: 'withdrawal',
    game_entry: 'game_entry',
    game_win: 'game_win',
    referral_commission: 'referral_commission',
    admin_credit: 'admin_credit',
    admin_debit: 'admin_debit',
    refund: 'refund',
};
export const GameStatus = {
    pending: 'pending',
    active: 'active',
    completed: 'completed',
    cancelled: 'cancelled',
    void: 'void',
};
export const AdminRole = {
    admin: 'admin',
    super_admin: 'super_admin',
};
//# sourceMappingURL=enums.js.map