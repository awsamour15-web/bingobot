export interface KenoTicket {
  id: string;
  numbers: number[];
}

export interface PlayerFeedItem {
  username: string;
  betAmount: number;
  pickedCount: number;
  matched: number | null;
  payout: number | null;
}
