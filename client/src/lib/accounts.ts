import { getLocalStore } from './local';
import type { SyncRow } from './local/types';

export interface Account {
  id: string;
  name: string;
  type: 'spending' | 'savings';
  openingBalancePaise: number;
  isEmergencyFund: boolean;
}

function toAccount(row: SyncRow): Account {
  return {
    id: row.id,
    name: row.name as string,
    type: row.type as Account['type'],
    openingBalancePaise: row.openingBalancePaise as number,
    isEmergencyFund: row.isEmergencyFund as boolean,
  };
}

export async function listAccounts(): Promise<Account[]> {
  const store = await getLocalStore();
  const rows = await store.getAllRows('accounts');
  return rows
    .filter((row) => row.deletedAt == null)
    .map(toAccount)
    .sort((a, b) => a.name.localeCompare(b.name));
}
