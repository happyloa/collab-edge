CREATE TABLE `attachment_references` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`card_id` text NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `references_board` ON `attachment_references` (`board_id`);--> statement-breakpoint
CREATE INDEX `references_card` ON `attachment_references` (`card_id`);--> statement-breakpoint
CREATE TABLE `board_restore_items` (
	`job_id` text NOT NULL,
	`kind` text NOT NULL,
	`source_id` text NOT NULL,
	`new_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`job_id`, `kind`, `source_id`),
	FOREIGN KEY (`job_id`) REFERENCES `board_restore_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `restore_item_ordinal` ON `board_restore_items` (`job_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `board_restore_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`target_board_id` text NOT NULL,
	`root` text NOT NULL,
	`header` text NOT NULL,
	`assignees` text NOT NULL,
	`state` text DEFAULT 'uploading' NOT NULL,
	`item_count` integer NOT NULL,
	`received_count` integer DEFAULT 0 NOT NULL,
	`byte_count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "restore_received_bounds" CHECK("board_restore_jobs"."received_count" >= 0 AND "board_restore_jobs"."received_count" <= "board_restore_jobs"."item_count"),
	CONSTRAINT "restore_byte_bounds" CHECK("board_restore_jobs"."byte_count" >= 0 AND "board_restore_jobs"."byte_count" <= 83886080)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `board_restore_jobs_target_board_id_unique` ON `board_restore_jobs` (`target_board_id`);--> statement-breakpoint
CREATE INDEX `restores_workspace` ON `board_restore_jobs` (`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `restore_staging_slot` ON `board_restore_jobs` ((1)) WHERE "board_restore_jobs"."byte_count" > 0 OR "board_restore_jobs"."state" = 'uploading';--> statement-breakpoint
ALTER TABLE `card_comments` ADD `imported_author_name` text;
--> statement-breakpoint
CREATE TRIGGER restore_copy_budget BEFORE UPDATE OF state ON board_restore_jobs
WHEN NEW.state='complete' AND OLD.state='uploading'
BEGIN
  INSERT INTO quotas(key,used) VALUES('restore-copy-bytes',OLD.byte_count)
    ON CONFLICT(key) DO UPDATE SET used=used+excluded.used;
  SELECT RAISE(ABORT,'Global restore storage budget reached') WHERE
    (SELECT used FROM quotas WHERE key='restore-copy-bytes')>67108864;
END;
--> statement-breakpoint
CREATE TRIGGER restore_item_insert_guard BEFORE INSERT ON board_restore_items
WHEN NOT EXISTS(SELECT 1 FROM board_restore_items WHERE job_id=NEW.job_id AND kind=NEW.kind AND source_id=NEW.source_id)
BEGIN
  SELECT RAISE(ABORT,'Restore is unavailable') WHERE NOT EXISTS(
    SELECT 1 FROM board_restore_jobs WHERE id=NEW.job_id AND state='uploading' AND expires_at > unixepoch()*1000
  );
  INSERT INTO quotas(key,used) VALUES('restore-items:' || date('now'),1) ON CONFLICT(key) DO UPDATE SET used=used+1;
  SELECT RAISE(ABORT,'Daily restore row quota reached') WHERE (SELECT used FROM quotas WHERE key='restore-items:' || date('now')) > 15000;
  DELETE FROM quotas WHERE key LIKE 'restore-items:%' AND key < 'restore-items:' || date('now','-2 day');
END;
--> statement-breakpoint
CREATE TRIGGER restore_item_inserted AFTER INSERT ON board_restore_items
BEGIN
  UPDATE board_restore_jobs SET received_count=received_count+1,byte_count=byte_count+length(CAST(NEW.payload AS BLOB)) WHERE id=NEW.job_id;
END;
--> statement-breakpoint
CREATE TRIGGER restore_item_deleted AFTER DELETE ON board_restore_items
BEGIN
  UPDATE board_restore_jobs SET byte_count=byte_count-length(CAST(OLD.payload AS BLOB)),received_count=CASE WHEN state='uploading' THEN received_count-1 ELSE received_count END WHERE id=OLD.job_id;
END;
