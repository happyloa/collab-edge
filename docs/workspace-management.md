# Workspace management / 工作區管理

`Dashboard` owns workspace selection, queries and mutation coordination. `Members` contains invitations, roles, removal, ownership transfer and leaving a workspace. `DeleteAccount` owns password confirmation, errors and deletion progress. Their response types live in `components/workspace/types.ts`.

Workspace mutations use a synchronous pending guard before sending a request. Controls stay disabled until the mutation and query refresh finish; sign-out also waits for an outstanding workspace mutation. Failed requests preserve form inputs and require an explicit retry. Account deletion has its own guard, preserves confirmation fields after failure and redirects to login after success.

Invitation, transfer and new-board forms reset when their workspace changes. Component keys include both their purpose and the workspace ID, so sibling components remain distinct. Creating an active board clears the archive filter to make the new board visible. A removed workspace selection falls back to an accessible workspace from the refreshed list.

These controls improve navigation and prevent repeated browser submissions. Server authorization, password checks, transaction guards and quotas remain authoritative. No automatic mutation retry, new cloud resource or production attachment capability was added.

React tests check repeated account-deletion submission, failure recovery and the owner restriction. The Chromium workspace scenario holds a failed request, checks the submission guard and retained inputs, switches workspaces, checks form resets and confirms a new board is visible. It also rejects React duplicate-key errors. Existing backup, account deletion and ownership-transfer scenarios cover the extracted flows.

## 中文

`Dashboard` 負責工作區選擇、查詢與寫入協調；`Members` 處理邀請、角色、移除成員、移轉擁有權及離開工作區。`DeleteAccount` 管理密碼確認、錯誤與刪除進度。介面回應型別集中在 `components/workspace/types.ts`。

送出工作區操作前會同步標記處理中，直到寫入與查詢刷新完成才重新開放控制項；期間也不能登出。失敗時保留輸入，由使用者明確重試。帳號刪除有獨立的重複送出保護，失敗後保留確認欄位，成功後前往登入頁。

切換工作區會重設邀請、移轉與新增看板表單。元件 key 同時包含用途與工作區 ID，避免同層元件互相混淆。建立新看板會清除封存篩選，讓新看板立即可見；目前選取的工作區若已不可存取，會改用刷新清單中的可存取工作區。

伺服器仍負責授權、密碼確認、交易檢查與配額。這次整理沒有加入自動重送、新雲端資源或正式站附件功能。React 與 Chromium 測試涵蓋重複送出、失敗保留輸入、工作區切換、新看板顯示及重複 key；既有備份、帳號刪除與擁有權移轉情境也會一起驗證。
