CREATE TABLE `account_links` (
	`auth_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_links_owner_id_unique` ON `account_links` (`owner_id`);--> statement-breakpoint
CREATE TABLE `account_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`language` text DEFAULT 'zh-Hant' NOT NULL,
	`updated_at` text NOT NULL
);
