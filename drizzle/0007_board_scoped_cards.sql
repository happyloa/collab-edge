-- A card and its column must belong to the same board, and neither may move to
-- another board. Board mutations already scope their own writes; these triggers
-- keep the invariant for every other writer and for any future statement.
CREATE TRIGGER cards_column_board_insert BEFORE INSERT ON cards
WHEN NOT EXISTS (SELECT 1 FROM board_columns WHERE id=NEW.column_id AND board_id=NEW.board_id)
BEGIN
  SELECT RAISE(ABORT, 'Card column is not on this board');
END;
--> statement-breakpoint
CREATE TRIGGER cards_column_board_update BEFORE UPDATE OF column_id, board_id ON cards
WHEN NOT EXISTS (SELECT 1 FROM board_columns WHERE id=NEW.column_id AND board_id=NEW.board_id)
BEGIN
  SELECT RAISE(ABORT, 'Card column is not on this board');
END;
--> statement-breakpoint
CREATE TRIGGER columns_board_fixed BEFORE UPDATE OF board_id ON board_columns
WHEN NEW.board_id IS NOT OLD.board_id
BEGIN
  SELECT RAISE(ABORT, 'Column cannot move to another board');
END;
