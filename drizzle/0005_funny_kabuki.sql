CREATE TABLE `account_exports` (
	`user_id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`exported_at` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `security_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`actor_hash` text NOT NULL,
	`event_type` text NOT NULL,
	`details` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_security_events_user_created` ON `security_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_security_events_created` ON `security_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `security_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`hits` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_security_rate_limits_expires` ON `security_rate_limits` (`expires_at`);