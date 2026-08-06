CREATE TABLE `consumables` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text,
	`campus_id` integer NOT NULL,
	`quantity_on_hand` integer DEFAULT 0 NOT NULL,
	`reorder_threshold` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`campus_id`) REFERENCES `campuses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `consumables_campus_idx` ON `consumables` (`campus_id`);--> statement-breakpoint
CREATE TABLE `license_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`license_id` integer NOT NULL,
	`assigned_to_user_id` integer NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`license_id`) REFERENCES `software_licenses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `license_assignments_license_idx` ON `license_assignments` (`license_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `license_assignments_unique` ON `license_assignments` (`license_id`,`assigned_to_user_id`);--> statement-breakpoint
CREATE TABLE `software_licenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`vendor` text,
	`campus_id` integer,
	`seats_total` integer DEFAULT 1 NOT NULL,
	`renewal_date` text,
	`cost` real,
	`notes` text,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`campus_id`) REFERENCES `campuses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `licenses_campus_idx` ON `software_licenses` (`campus_id`);--> statement-breakpoint
CREATE INDEX `licenses_renewal_idx` ON `software_licenses` (`renewal_date`);