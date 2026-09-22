ALTER TABLE `boards` ADD `name_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `boards` ADD `archived` integer DEFAULT false NOT NULL;