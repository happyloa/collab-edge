ALTER TABLE `users` ADD `deleted_at` integer;
--> statement-breakpoint
CREATE TRIGGER prevent_deleted_session BEFORE INSERT ON sessions
WHEN (SELECT deleted_at FROM users WHERE id=NEW.user_id) IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Account deleted');
END;
--> statement-breakpoint
CREATE TRIGGER prevent_deleted_membership BEFORE INSERT ON workspace_members
WHEN (SELECT deleted_at FROM users WHERE id=NEW.user_id) IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Account deleted');
END;
--> statement-breakpoint
CREATE TRIGGER prevent_deleted_user_update BEFORE UPDATE ON users
WHEN OLD.deleted_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Account deleted');
END;
