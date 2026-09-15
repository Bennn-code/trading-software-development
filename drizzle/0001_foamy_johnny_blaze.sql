CREATE TABLE `reviews` (
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`start_date` text NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `kind`, `start_date`)
);
