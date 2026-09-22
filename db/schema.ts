import { sqliteTable, text, integer, index, primaryKey } from 'drizzle-orm/sqlite-core';
export const trades = sqliteTable('trades', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(),
  exitTime: text('exit_time').notNull(), payload: text('payload').notNull(),
  updatedAt: text('updated_at').notNull(),
}, t=>[index('idx_trades_user_exit').on(t.userId,t.exitTime)]);
export const images = sqliteTable('images', {
  id:text('id').primaryKey(), userId:text('user_id').notNull(),
  objectKey:text('object_key').notNull(), mime:text('mime').notNull(),
  filename:text('filename').notNull(), size:integer('size').notNull(),
  digest:text('digest'), duplicateStep:integer('duplicate_step').notNull().default(0),
}, t=>[index('idx_images_user').on(t.userId),index('idx_images_user_digest').on(t.userId,t.digest)]);
export const reviews = sqliteTable('reviews', {
 userId:text('user_id').notNull(), kind:text('kind').notNull(), startDate:text('start_date').notNull(),
 payload:text('payload').notNull(), updatedAt:text('updated_at').notNull(),
}, t=>[primaryKey({columns:[t.userId,t.kind,t.startDate]})]);
export const importDuplicateApprovals=sqliteTable('import_duplicate_approvals',{
 userId:text('user_id').notNull(),tradeId:text('trade_id').notNull(),fingerprint:text('fingerprint').notNull(),step:integer('step').notNull().default(0),expiresAt:integer('expires_at').notNull(),
},t=>[primaryKey({columns:[t.userId,t.tradeId]})]);
export const exchangeRates=sqliteTable('exchange_rates',{
 pair:text('pair').primaryKey(),payload:text('payload').notNull(),fetchedAt:integer('fetched_at').notNull(),
});
export const accountLinks=sqliteTable('account_links',{
 authId:text('auth_id').primaryKey(),ownerId:text('owner_id').notNull().unique(),createdAt:text('created_at').notNull(),
});
export const accountPreferences=sqliteTable('account_preferences',{
 userId:text('user_id').primaryKey(),language:text('language').notNull().default('zh-Hant'),updatedAt:text('updated_at').notNull(),
});
export const securityRateLimits=sqliteTable('security_rate_limits',{
 key:text('key').primaryKey(),hits:integer('hits').notNull().default(0),expiresAt:integer('expires_at').notNull(),
},t=>[index('idx_security_rate_limits_expires').on(t.expiresAt)]);
export const securityEvents=sqliteTable('security_events',{
 id:text('id').primaryKey(),userId:text('user_id'),actorHash:text('actor_hash').notNull(),eventType:text('event_type').notNull(),
 details:text('details').notNull().default('{}'),createdAt:text('created_at').notNull(),
},t=>[index('idx_security_events_user_created').on(t.userId,t.createdAt),index('idx_security_events_created').on(t.createdAt)]);
export const accountExports=sqliteTable('account_exports',{
 userId:text('user_id').primaryKey(),tokenHash:text('token_hash').notNull(),exportedAt:text('exported_at').notNull(),expiresAt:integer('expires_at').notNull(),
});
