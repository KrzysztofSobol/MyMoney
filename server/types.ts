export interface ParsedTransaction {
  transactionDate: string;
  postingDate: string | null;
  amount: number;
  currency: string;
  description: string;
  category: string | null;
  counterparty: string | null;
  csvHash: string;
}
