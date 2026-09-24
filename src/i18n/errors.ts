import type { Locale } from './messages';

const errors: Record<string, string> = {
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
  'Viewers cannot edit': '檢視者無法編輯',
  'Only the owner can manage members': '只有擁有者可以管理成員',
  'This user must register first': '此使用者必須先註冊帳號',
  'Already a member': '此使用者已是成員',
  'Owners must retain workspace ownership': '擁有者目前無法離開自己的工作區',
  'The owner cannot be removed or demoted': '無法移除擁有者或降低其權限',
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
