# DMS Dashboard V35 — 安全資料庫建置底稿

## 目前交付範圍
- `schema.sql`：Supabase 資料表、中心權限 RLS、KPI 彙總、改善行動資料表。
- `config.example.js`：GitHub Pages 可用的公開連線設定格式。
- `index.html`：六頁 UI 原型（尚未與資料庫實際串接）。

## 正式上線前必要工作
1. 建立 Supabase 專案，執行 `schema.sql`。
2. 在 Supabase Auth 建立管理者帳號，並由 SQL Editor 授予 OP 權限：`insert into public.user_centers(user_id,center,role) values ('管理者auth UUID','ALL','op');`。
3. 設定 Supabase Auth 網站 URL / Redirect URLs，配置安全登入。
4. 建立正式的匯入程式：先於瀏覽器移除顧客電話、地址、詳細地址、備註等敏感欄位，驗證資料並分批 UPSERT；訂單以唯一訂單 ID 去重。
5. 設定匯入失敗重試、異常紀錄、歷史 KPI 彙總檢查、備份與 12 個月清理排程。不得在彙總未驗證前刪除明細。
6. 測試 OP/中心角色隔離，確認資料庫 RLS 生效，再部署 GitHub Pages。

## 指標規格
- 晚指派：原 ETA - 指派 <= 20 分鐘。
- Rider 晚到店：原 ETA - 門市到達 < 15 分鐘。
- 延遲平均等待時間：僅 OWN、正常到店等餐 >7 分或晚到店等餐 >5 分；分子為符合條件訂單的完整等待分鐘總和，分母為符合條件的訂單 TC。
- D25：採 DMS 原始 Y/N，不重新推算。
- 訂單明細 12 個月；歷史 KPI 彙總持續保留。

**注意**：這份是可用於建置的架構底稿，不代表已連線、完成部署或通過真實資料驗收。Supabase 專案尚未授權時無法遠端建立資料表。
