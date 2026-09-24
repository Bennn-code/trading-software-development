import type { Account } from './account-auth';
import type { UserPreferences } from './preferences';
import type { Trade } from './trades';

export type AccountBootstrap = {
  account: Account | null;
  emailEnabled: boolean;
  canLink: boolean;
  turnstileSiteKey: string | null;
  accountDeletionReady: boolean;
  language: string | null;
  preferences: UserPreferences | null;
  profiles: { id: string; name: string; isMain: boolean; createdAt: string; tradeCount: number }[];
  activeProfileId: string | null;
  trades?: Trade[];
};

let cached: AccountBootstrap | null = null;
let pending: Promise<AccountBootstrap | null> | null = null;

export function getAccountBootstrap() {
  if (cached) return Promise.resolve(cached);
  if (pending) return pending;
  pending = fetch('/api/account')
    .then(async response => response.ok ? await response.json() as AccountBootstrap : null)
    .then(value => (cached = value))
    .catch(() => null)
    .finally(() => { pending = null; });
  return pending;
}

export function updateAccountBootstrap(update: (current: AccountBootstrap) => AccountBootstrap) {
  if (cached) cached = update(cached);
}
