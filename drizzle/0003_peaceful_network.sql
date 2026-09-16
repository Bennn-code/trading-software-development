CREATE TABLE `exchange_rates` (
	`pair` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `import_duplicate_approvals` (
	`user_id` text NOT NULL,
	`trade_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`step` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `trade_id`)
);
