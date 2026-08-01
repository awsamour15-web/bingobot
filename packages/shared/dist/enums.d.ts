export type WalletType = 'main' | 'play';
export declare const WalletType: {
    main: WalletType;
    play: WalletType;
};
export type TxType = 'deposit' | 'withdrawal' | 'game_entry' | 'game_win' | 'referral_commission' | 'admin_credit' | 'admin_debit' | 'refund';
export declare const TxType: {
    deposit: TxType;
    withdrawal: TxType;
    game_entry: TxType;
    game_win: TxType;
    referral_commission: TxType;
    admin_credit: TxType;
    admin_debit: TxType;
    refund: TxType;
};
export type GameStatus = 'pending' | 'active' | 'completed' | 'cancelled' | 'void';
export declare const GameStatus: {
    pending: GameStatus;
    active: GameStatus;
    completed: GameStatus;
    cancelled: GameStatus;
    void: GameStatus;
};
export type AdminRole = 'admin' | 'super_admin';
export declare const AdminRole: {
    admin: AdminRole;
    super_admin: AdminRole;
};
//# sourceMappingURL=enums.d.ts.map