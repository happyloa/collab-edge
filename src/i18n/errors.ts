import type { Locale } from './messages';

const errors: Record<string, string> = {
  'Shared demo history cannot be cleared.': '共用示範看板的歷史紀錄無法清除。',
  'Only the workspace owner can manage board history.':
    '只有工作區擁有者能管理看板歷史紀錄。',
  'The history cutoff must be at least 30 days old.':
    '清理範圍必須在 30 天之前。',
  'Board changed. Refresh history maintenance and review again.':
    '看板已變更，請重新讀取並檢視清理預覽。',
  'Recent history must be retained.': '最近的歷史紀錄必須保留。',
  'History maintenance batch is too large.': '歷史紀錄清理批次過大。',
  'Board confirmation does not match.': '看板確認資料不符。',
  'Temporary backup cleanup is incomplete. Try again.':
    '暫存備份資料尚未清完，請再試一次。',
  'Select the original backup file to resume this restore.':
    '請選取原本的備份檔案，以繼續這次還原。',
  'This restore has expired or belongs to another account. Cancel it before starting again.':
    '這次還原已過期或由另一個帳號建立。請先取消，再重新開始。',
  'Cancel this restore and clean up its temporary data before starting again.':
    '請先取消這次還原並清除暫存資料，再重新開始。',
  'Backup file exceeds 96 MiB.': '備份檔案超過 96 MiB 上限。',
  'Select a valid CollabEdge JSON backup.':
    '請選取有效的 CollabEdge JSON 備份。',
  'Backup is invalid, damaged or exceeds board limits.':
    '備份格式不符、內容損壞，或資料超過看板上限。',
  'Board export failed. Please try again.': '看板匯出失敗，請再試一次。',
  'Invalid backup payload': '備份資料格式不符。',
  'Database daily capacity reached. Try again tomorrow.':
    '資料庫已達每日限額，請保留備份並於明天再試。',
  'Restore capacity reached. Keep the backup and try again later.':
    '還原已達容量上限，請保留備份並稍後再試。',
  'Another restore needs to finish or be cleaned up first.':
    '請先完成其他還原，或清除其暫存資料。',
  'Restore state or workspace ownership changed.':
    '還原狀態或工作空間擁有者已變更，請重新確認後再試。',
  'Backup contains duplicate IDs': '備份包含重複的資料 ID。',
  'Restore failed. Keep the backup and try again.':
    '還原失敗，請保留備份並再試一次。',
  'Restore access denied': '只有目前的工作空間擁有者可以操作還原。',
  'Restore belongs to another account': '這次還原由另一個帳號建立。',
  'Restore is no longer accepting uploads': '這次還原已停止接受上傳。',
  'Restore upload expired': '這次還原已過期，請取消後重新開始。',
  'Upload backup records in order': '請依序上傳備份資料。',
  'Backup upload is incomplete': '備份尚未上傳完成。',
  'Backup transfer proof does not match': '上傳的資料與原備份不符。',
  'Backup contains invalid revisions': '備份中的資料版本不符。',
  'Backup contains broken relationships': '備份中的資料關聯不符。',
  'A completed restore cannot be cancelled': '已完成的還原無法取消。',
  'Finish or cancel the restore before cleanup':
    '請先完成或取消還原，再清除暫存資料。',
  'Backup record exceeds request limits': '單筆備份資料超過請求大小上限。',
  'Sign in to the original account to recover this draft.':
    '請登入原本的帳號，才能繼續處理這份草稿。',
  'Connection lost. Check your network and try again.':
    '連線中斷，請檢查網路後重試。',
  'You do not have permission to perform this action.':
    '你沒有執行此操作的權限。',
  'Too many requests. Please wait before trying again.':
    '操作過於頻繁，請稍候再試。',
  'The service is temporarily unavailable. Please try again later.':
    '服務暫時無法使用，請稍後重試。',
  'Assignee must be a current workspace member': '負責人必須是目前的工作區成員',
  'Request failed': '操作失敗，請稍後重試。',
  'Request failed. Please try again.': '操作失敗，請稍後重試。',
  'Sign in failed': '登入失敗，請稍後重試。',
  'Unable to open demo': '無法開啟示範看板，請稍後重試。',
  'Delete failed': '刪除失敗，請稍後重試。',
  'Upload failed': '上傳失敗，請稍後重試。',
  'Maximum file size is 10 MB': '檔案大小上限為 10 MB',
  'The site has reached its daily usage limit. Please try again tomorrow.':
    '本站已達每日使用上限，請明天再試。',
  'Too many requests. Please wait a minute.': '操作過於頻繁，請稍候一分鐘。',
  'The usage guard is temporarily unavailable. Please try again later.':
    '使用量檢查暫時無法使用，請稍後重試。',
  'Session configuration unavailable': '登入服務暫時無法使用，請稍後重試。',
  'Password configuration unavailable':
    '密碼驗證服務暫時無法使用，請稍後重試。',
  'Account state changed. Please sign in again.':
    '帳號狀態已變更，請重新登入。',
  'Invalid email or password': '電子郵件或密碼不正確',
  'Unable to register this email': '無法使用此電子郵件註冊',
  'Display name required': '請輸入顯示名稱',
  'Registration is currently closed': '目前暫停註冊',
  'Use your Cloudflare Access verified email':
    '請使用剛才通過 Cloudflare Access 驗證的信箱註冊。',
  'Verify your email with Cloudflare Access first':
    '請先透過 Cloudflare Access 完成信箱驗證。',
  'No account uses your verified email':
    '這個已驗證信箱尚未註冊 CollabEdge 帳號。',
  'Verified email already belongs to another account':
    '這個已驗證信箱已由另一個 CollabEdge 帳號使用。',
  'Demo accounts cannot verify email': '示範帳號不能綁定正式信箱。',
  'Passwords do not match': '兩次輸入的密碼不相同',
  'Please sign in': '請先登入',
  'Session expired': '登入已過期，請重新登入。',
  'Workspace access denied': '你沒有此工作區的存取權限',
  'Workspace usage access denied': '只有目前的工作區擁有者能查看容量。',
  'Viewers cannot edit': '檢視者無法編輯',
  'Only the owner can manage members': '只有擁有者可以管理成員',
  'This user must register first': '此使用者必須先註冊帳號',
  'Already a member': '此使用者已是成員',
  'Owners must retain workspace ownership': '擁有者目前無法離開自己的工作區',
  'The owner cannot be removed or demoted': '無法移除擁有者或降低其權限',
  'Too many password confirmations. Try again later.':
    '密碼確認次數過多，請稍後再試。',
  'Incorrect password': '密碼不正確',
  'Demo accounts cannot be deleted': '示範帳號無法刪除',
  'Transfer ownership of your workspaces before deleting your account':
    '請先轉移工作區擁有權，再刪除帳號',
  'Account or workspace state changed. Reload and retry.':
    '帳號或工作區狀態已變更，請重新載入後再試。',
  'Demo ownership cannot be transferred': '示範帳號或工作區無法轉移擁有權',
  'Choose another workspace member': '請選擇其他工作區成員',
  'Choose a current workspace member': '請選擇目前的工作區成員',
  'Recipient owns the maximum number of workspaces':
    '接收者擁有的工作區已達上限',
  'This account is unavailable': '此帳號已無法使用',
  'Workspace membership changed. Reload and retry.':
    '工作區成員狀態已變更，請重新載入後再試。',
  'Transfer request is unavailable or expired': '轉移邀請已失效或過期',
  'No pending ownership transfer': '目前沒有待處理的擁有權轉移',
  'Board not found': '找不到看板',
  'Card not found': '找不到卡片',
  'Card no longer exists': '此卡片已不存在',
  'Column no longer exists': '此欄位已不存在',
  'Destination no longer exists': '目標欄位已不存在',
  'This board is archived': '此看板已封存',
  'The shared demo board cannot be archived': '無法封存共用示範看板',
  'Move or archive and retain cards before removing this column. Only empty columns can be removed.':
    '只能移除空欄位，請先將其中的卡片移至其他欄位。封存卡片仍會保留。',
  'Attachment not found': '找不到附件',
  'File unavailable': '目前無法取得檔案',
  'Attachments are disabled in this cost-limited environment':
    '為控制費用，此環境已停用附件功能。',
  'File contents do not match the declared type': '檔案內容與宣告的類型不符',
  'Missing file': '請選擇檔案',
  'File size mismatch': '檔案大小不符',
  'Invalid file size': '檔案大小不正確',
  'Invalid server response': '伺服器回應格式不正確，請重新連線。',
  'Unexpected server response': '收到非預期的伺服器回應，請重新連線。',
  'Your session or membership expired. Please sign in again.':
    '登入狀態或成員資格已過期，請重新登入。',
  'Reconnect before submitting. Your draft is preserved.':
    '請先重新連線再送出，你的草稿已保留。',
  'Invalid request payload': '輸入資料格式不正確，請檢查後重試。',
  'Invalid request origin': '請由本站頁面重新送出操作。',
  'Request too large': '送出的資料過大',
  'Message too large': '送出的訊息過大',
  'This demo has reached its usage limit. Please try again later or contact the owner.':
    '此示範環境已達使用上限，請稍後重試或聯絡擁有者。',
};

export function translateError(locale: Locale, message?: string): string {
  if (!message) return '';
  if (locale === 'en') return message;
  if (Object.hasOwn(errors, message)) return errors[message];
  if (
    /(quota|budget|capacity|limit) reached|too many|rate limit/i.test(message)
  )
    return '已達使用上限，請稍後重試或聯絡擁有者。';
  if (/conflict|changed|newer|another user/i.test(message))
    return '資料已被其他操作更新。你的草稿已保留，請確認最新內容後重試。';
  return '操作未完成，請檢查輸入與連線後重試。';
}
