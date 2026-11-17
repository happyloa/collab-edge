ALTER TABLE `card_comments` ADD `body_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `card_comments` ADD `edited_at` text;