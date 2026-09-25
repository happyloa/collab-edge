CREATE TABLE `workspace_transfers` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`from_user_id` text NOT NULL,
	`to_user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TRIGGER cap_transferred_workspaces BEFORE UPDATE OF owner_id ON workspaces
WHEN NEW.owner_id <> OLD.owner_id AND
  (SELECT count(*) FROM workspaces WHERE owner_id=NEW.owner_id) >= 3
BEGIN
  SELECT RAISE(ABORT, 'Workspace quota reached');
END;
