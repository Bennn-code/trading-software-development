ALTER TABLE `trades` ADD `profile_id` text NOT NULL DEFAULT '';
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_trades_user_exit`;
--> statement-breakpoint
CREATE INDEX `idx_trades_user_profile_exit` ON `trades` (`user_id`,`profile_id`,`exit_time`);
--> statement-breakpoint
CREATE TABLE `trading_profiles` (`id` text PRIMARY KEY NOT NULL,`user_id` text NOT NULL,`name` text NOT NULL,`is_main` integer DEFAULT 0 NOT NULL,`created_at` text NOT NULL,`updated_at` text NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_trading_profiles_user` ON `trading_profiles` (`user_id`);
--> statement-breakpoint
ALTER TABLE `account_preferences` ADD `show_demo_data` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `account_preferences` ADD `timezone` text DEFAULT 'Asia/Taipei' NOT NULL;
--> statement-breakpoint
ALTER TABLE `account_preferences` ADD `base_currency` text DEFAULT 'auto' NOT NULL;
--> statement-breakpoint
ALTER TABLE `account_preferences` ADD `pnl_color` text DEFAULT 'green_gain' NOT NULL;
--> statement-breakpoint
ALTER TABLE `account_preferences` ADD `active_profile_id` text;
--> statement-breakpoint
CREATE TABLE `reviews_new` (`user_id` text NOT NULL,`profile_id` text DEFAULT '' NOT NULL,`kind` text NOT NULL,`start_date` text NOT NULL,`payload` text NOT NULL,`updated_at` text NOT NULL,PRIMARY KEY(`user_id`,`profile_id`,`kind`,`start_date`));
--> statement-breakpoint
INSERT INTO `reviews_new` (`user_id`,`kind`,`start_date`,`payload`,`updated_at`) SELECT `user_id`,`kind`,`start_date`,`payload`,`updated_at` FROM `reviews`;
--> statement-breakpoint
DROP TABLE `reviews`;
--> statement-breakpoint
ALTER TABLE `reviews_new` RENAME TO `reviews`;
