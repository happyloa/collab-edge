ALTER TABLE `boards` ADD `history_pruned_through` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `board_events` ADD `payload_pruned` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `events_retention` ON `board_events` (`board_id`,`payload_pruned`,`revision`);