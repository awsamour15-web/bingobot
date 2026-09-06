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
export const WinPattern = {
    any_line: 'any_line',
    row: 'row',
    column: 'column',
    diagonal_tl_br: 'diagonal_tl_br',
    diagonal_tr_bl: 'diagonal_tr_bl',
    corners: 'corners',
    full_house: 'full_house',
};
/** Human-readable label for display */
export const WIN_PATTERN_LABELS = {
    any_line: 'Any Line',
    row: 'Any Row',
    column: 'Any Column',
    diagonal_tl_br: 'Diagonal ↘',
    diagonal_tr_bl: 'Diagonal ↙',
    corners: '4 Corners',
    full_house: 'Full House',
};
//# sourceMappingURL=enums.js.map