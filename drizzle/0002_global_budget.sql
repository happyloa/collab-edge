CREATE TRIGGER cap_total_boards BEFORE INSERT ON boards WHEN (SELECT count(*) FROM boards)>=100 BEGIN SELECT RAISE(ABORT,'Global board capacity reached'); END;
CREATE TRIGGER cap_event_storage BEFORE INSERT ON board_events BEGIN
  INSERT INTO quotas(key,used) VALUES('event-bytes',length(CAST(NEW.payload AS BLOB))) ON CONFLICT(key) DO UPDATE SET used=used+excluded.used;
  SELECT CASE WHEN (SELECT used FROM quotas WHERE key='event-bytes')>52428800 THEN RAISE(ABORT,'Global event storage budget reached') END;
  INSERT INTO quotas(key,used) VALUES('event-count',1) ON CONFLICT(key) DO UPDATE SET used=used+1;
  SELECT CASE WHEN (SELECT used FROM quotas WHERE key='event-count')>20000 THEN RAISE(ABORT,'Global event count budget reached') END;
END;
