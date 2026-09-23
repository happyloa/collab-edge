ALTER TABLE `cards` ADD `assignee_id` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `cards` ADD `due_date` text;--> statement-breakpoint
ALTER TABLE `cards` ADD `assignee_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `cards` ADD `due_date_revision` integer DEFAULT 0 NOT NULL;
