ALTER TABLE `images` ADD `digest` text;--> statement-breakpoint
ALTER TABLE `images` ADD `duplicate_step` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_images_user_digest` ON `images` (`user_id`,`digest`);