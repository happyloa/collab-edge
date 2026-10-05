# Board backups and restore

The board's **Export board JSON** button downloads a validated, versioned snapshot in the browser. A workspace owner can open **Restore a board backup**, select the file, review the counts, map old task assignees to current members and confirm a separate new board. Existing boards keep their IDs, contents and revisions.

## What the file contains

Version `collabedge.board.v2` includes the board, columns, cards, archived state, assignees, calendar due dates, comments, member display names and attachment metadata. A SHA-256 checksum covers the structured payload in canonical key order; JSON whitespace does not affect it. Validation also checks unique IDs, relationships, field revisions and product limits. The checksum detects changed files. It does not authenticate the person who produced one.

The reader accepts older `collabedge.board.v1` exports after the same structural validation and displays their missing-checksum warning. Keep these files private: they contain board text and member names. They contain no password, session cookie, Access token or R2 object key.

Attachment binaries and previous event history are omitted. Imported files become unavailable references with their names, MIME types and sizes. The UI provides no download link for them, and they count toward the ten-file limit per card. Exporting an imported board includes those references again. Imported comments preserve their original body and timestamp, with an explicitly unverified author name from the file. Their database actor is the current restorer; the import never creates users or impersonates historical accounts.

## Preview and recovery

Selecting a file validates it locally and prepares its upload proofs before any server write. Preview shows entity counts and the checksum status. Tasks default to unassigned. An owner can explicitly map each historical assignee to a current workspace member; membership is checked again when committing the new board.

Uploads use at most 30 records and 32 KiB of UTF-8 JSON per request. A Merkle root binds the header, ordered records and source IDs. The server accepts a contiguous prefix, checks every record's proof and rejects an altered retry. Re-selecting the same file after a reload resumes from the server's confirmed prefix, retaining the original assignee mapping. The file stays on the owner's device; it is not stored in browser draft persistence.

The server creates a random target board ID and coordinates upload, finalization, cancellation and cleanup through that board's existing `BoardRoom`. D1 holds the staging data. Partial uploads have no board entry, do not appear in normal board queries and are accessible only to the current workspace owner. A new owner may cancel an abandoned job but cannot continue the previous account's import.

Finalization inserts the board at revision one, new entity UUIDs, normalized ordering, comments and unavailable file references in one guarded D1 batch. The same batch records one compact `board.import` event and marks the receipt complete. A failed authorization, relationship, assignment or quota check rolls back the entire copy. New socket connections receive its complete snapshot. Old revisions and mutation UUID history are not replayed.

If a start, upload or finalization response is lost, retry uses the original job ID and checks its status first. A completed receipt returns the original target board. Cleanup failures leave that board available and provide a separate cleanup button. Canceling an unfinished restore removes only its temporary data. Cleanup deletes at most 500 staging records per request, preserving completed receipts for idempotency.

## Capacity boundaries

| Boundary                | Limit                                                                        |
| ----------------------- | ---------------------------------------------------------------------------- |
| Local input file        | 96 MiB                                                                       |
| Active staging slot     | One across the site                                                          |
| Staged record payload   | 80 MiB                                                                       |
| Upload expiry           | Seven days                                                                   |
| Newly staged records    | 15,000 per UTC day globally; identical retries do not increment this counter |
| Retained import payload | 64 MiB cumulatively across the site                                          |
| Request body            | 32 KiB; at most 30 records                                                   |
| Cleanup batch           | 500 records                                                                  |

Normal workspace, board, card, comment and global event quotas still apply. The import payload counter commits with the copied entities. Archiving a board and cleaning temporary data do not reset it. These are application payload counters, not measurements of the provider's database storage or billed rows.

The existing dynamic-request and per-IP guards also apply to every upload and cleanup request. Provider D1 daily capacity can stop work before an application counter is exhausted. A large restore may require waiting for the limit to reset; keep the source file and resume within seven days. There is no automatic write retry, quota reset, paid upgrade, new binding, cron or production R2 operation.

Expired staging is reclaimed in bounded pages when an authorized owner explicitly starts another restore. Cleanup commits independently, so repeated attempts can drain an expired job even while the single slot prevents a new one. Nothing deletes completed boards. Pending completed staging can also be cleared through its explicit cleanup action.

## Verification

Workerd tests exercise versioned checksums, legacy files, transfer tampering, authorization and ownership changes, quota rollback, ordering, unavailable files, immutable retries and bounded cleanup. A fresh local D1 restore verifies a 20-card, 1,000-comment copy, including maximum-length CJK description and comment fields. Browser coverage injects lost upload and finalization responses, reloads, re-selects the file and checks that only one board is created; it also checks cancellation, author labels and Chinese file-reference text.

These checks establish local behavior. Current CI, deployment and authenticated production evidence belongs in [delivery status](delivery-status.md). Production attachment binaries remain disabled. Safe event compaction, database-wide disaster recovery and authenticated production restore smoke are separate work.

## 中文操作說明

先在已連線且沒有待確認編輯的看板下載 JSON，再由工作空間擁有者開啟「還原看板備份」。選取檔案後可預覽數量、檢查校驗結果，並將原本的任務指派給目前成員。確認後會建立新的看板，原資料不受影響。

上傳中斷時保留原檔案，重新開啟工作空間並選取同一份檔案即可續傳。原先的指派選擇會保留。若已達限額，請待限額重設後再試；暫存保留七天。已完成但尚未清完的暫存，可按「清除暫存備份資料」。

備份不含附件檔案與完整事件歷史。還原後只顯示無法下載的檔案參照；留言中的原作者名稱來自備份，身分未經驗證。這項功能可復原看板資料；整個帳號、資料庫與 Cloudflare 設定仍需各自備份。
