// ============================================
// i18n — JA/EN switching, single self-contained file
// (same spirit as brand.js: no imports, no bundler).
// Public API: global `const I18N`.
//   I18N.getLang()            -> "ja" | "en"
//   I18N.setLang(lang)        -> persist + <html lang> + apply() + onChange callbacks
//   I18N.t(key, params?)      -> translate with {param} interpolation
//   I18N.apply(root?)         -> re-apply [data-i18n*] elements in bulk (<title> excluded: fixed JA)
//   I18N.onChange(cb)         -> subscribe: cb runs after every setLang
// Dictionary fallback: current locale -> ja -> the key itself
// (a missing key never throws).
// ============================================

const I18N = (() => {
  const STORAGE_KEY = "lang";

  // ---- dictionary (ja is the fallback locale) ----
  const locales = {
    ja: {
      // NOTE: <title> is intentionally NOT translated (brand/title stay JA).
      "index.tab.signin": "ログイン",
      "index.tab.signup": "新規登録",
      "index.label.displayName": "表示名",
      "index.label.email": "メールアドレス",
      "index.label.password": "パスワード",
      "index.submit.signin": "ログイン",
      "index.submit.signup": "登録する",
      "index.or": "または",
      "index.google": "Googleでログイン",
      "index.error.required": "メールアドレスとパスワードを入力してください。",
      "index.error.generic": "エラーが発生しました。",
      "index.error.google": "Googleログインに失敗しました。もう一度お試しください。",
      "index.error.googleUnconfigured": "Googleログインは未設定です。",
      "index.placeholder.displayName": "山田 太郎",
      "index.placeholder.password": "8文字以上",

      // ---- dashboard.* ----
      "dashboard.eyebrow": "Projects",
      "dashboard.title": "プロジェクト一覧",
      "dashboard.label.projectName": "プロジェクト名",
      "dashboard.label.client": "クライアント名",
      "dashboard.placeholder.projectName": "例: まいぷれ仕様書",
      "dashboard.placeholder.client": "例: 〇〇株式会社",
      "dashboard.submit.create": "作成",
      "dashboard.loading": "読み込み中…",
      "dashboard.empty": "プロジェクトがまだありません。",
      "dashboard.emptyCta": "上のフォームから作成できます。",
      "dashboard.open": "開く",
      "dashboard.error.load": "読み込みに失敗しました:",
      "dashboard.error.nameRequired": "プロジェクト名を入力してください",
      "dashboard.error.create": "作成に失敗しました:",
      "dashboard.toast.created": "プロジェクトを作成しました",

      // ---- account.* ----
      "account.eyebrow": "Account",
      "account.title": "アカウント設定",
      "account.signedInAs": "ログイン中",
      "account.section.changePassword": "パスワード変更",
      "account.label.currentPassword": "現在のパスワード",
      "account.label.newPassword": "新しいパスワード (8文字以上)",
      "account.label.confirmPassword": "新しいパスワード(確認)",
      "account.submit.change": "変更する",
      "account.note.sessions": "変更すると他の端末のログインはすべて無効になります。",
      "account.error.mismatch": "確認用パスワードが一致しません",
      "account.error.generic": "パスワードの変更に失敗しました。",
      "account.toast.changed": "パスワードを変更しました",

      // ---- project.* ----
      "project.eyebrow": "Project",
      "project.loading": "読み込み中…",
      "project.label.upload": "ファイルをアップロード",
      "project.chooseFile": "ファイルを選択",
      "project.chooseFolder": "フォルダを選択",
      "project.note.folder": "フォルダ選択・ドロップはブラウザ内で ZIP にまとめてからアップロードします（デスクトップの主要ブラウザ向け。モバイルの一部ブラウザでは使えません）。",
      "project.uploadingFolder": "フォルダを ZIP 化中… {count} files",
      "project.uploadingFolderDone": "ZIP 化完了（{count} 件）— アップロードへ",
      "project.error.folderEmpty": "アップロードできるファイルがありません（除外対象のみです）",
      "project.error.folderTooMany": "ファイルが多すぎます（{count} 件）。対象を絞ってください",
      "project.error.folderTooLarge": "フォルダの合計サイズが大きすぎます（上限 20MB）",
      "project.error.folderZip": "フォルダの ZIP 化に失敗しました",
      "project.noFile": "ファイルが選択されていません",
      "project.submit.upload": "アップロード",
      "project.dropHint": "ここにドラッグ＆ドロップでも追加できます",
      "project.note.versions": "同じ名前のファイルを再アップロードすると新版本として保存されます。",
      "project.section.documents": "ドキュメント",
      "project.section.members": "メンバー",
      "project.label.email": "メールアドレス",
      "project.label.name": "表示名",
      "project.placeholder.name": "クライアント 太郎",
      "project.label.role": "ロール",
      "project.role.client_commenter": "コメント可",
      "project.role.client_viewer": "閲覧のみ",
      "project.role.owner": "オーナー",
      "project.submit.invite": "招待する",
      "project.note.invite": "未登録のメールアドレスを招待すると、一時パスワードが発行されます。",
      "project.copy": "コピー",
      "project.pw.note": "このパスワードは初回ログイン後に変更できます。安全な方法で共有してください。",
      "project.error.notFound": "プロジェクトが見つかりません",
      "project.docs.empty": "ドキュメントがまだありません。",
      "project.docs.lastUpdated": "最終更新: {date}",
      "project.docs.versions": "{count} バージョン",
      "project.docs.version": "{count} バージョン",
      "project.docs.download": "ダウンロード",
      "project.docs.delete": "削除",
      "project.error.download": "ダウンロードに失敗しました",
      "project.filesCount": "{count} 件選択中",
      "project.error.noFile": "ファイルを選択してください",
      "project.upload.done": "完了: {count}件成功",
      "project.upload.doneFail": "完了: {ok}件成功 / {fail}件失敗",
      "project.confirm.deleteDoc": "ドキュメントを削除",
      "project.confirm.deleteDocMsg": "「{name}」を削除しますか？\n全 {count} バージョンと、付いているコメントもすべて削除されます。",
      "project.confirm.deleteOk": "削除する",
      "project.toast.deleted": "「{name}」を削除しました",
      "project.toast.deletePartial": "一部削除に失敗しました ({fail}/{count})",
      "project.members.empty": "クライアントメンバーはまだいません。",
      "project.remove": "削除",
      "project.pwreset": "PWリセット",
      "project.you": "あなた",
      "project.error.emailRequired": "メールアドレスを入力してください",
      "project.pw.created": "{email} のアカウントを作成しました",
      "project.toast.memberAdded": "アカウントを作成し、メンバーに追加しました",
      "project.toast.existing": "既存アカウントをメンバーに追加しました",
      "project.toast.copied": "コピーしました",
      "project.toast.copyFailed": "コピーできませんでした — 手動で選択してください",
      "project.confirm.resetPw": "パスワードをリセット",
      "project.confirm.resetPwMsg": "{email} のパスワードをリセットしますか？\n既存のログインセッションはすべて無効になります。",
      "project.confirm.resetOk": "リセットする",
      "project.pw.newPw": "{email} の新しいパスワード",
      "project.toast.pwReset": "パスワードをリセットしました",
      "project.confirm.removeMember": "メンバーを削除",
      "project.confirm.removeMemberMsg": "このメンバーをプロジェクトから削除しますか？",
      "project.confirm.removeOk": "削除する",
      "project.folderConfirm.title": "フォルダをアップロードしますか？",
      "project.folderConfirm.message": "フォルダを選ぶと、中身を ZIP に固めてこのプロジェクトにアップロードします。選択後、ブラウザが「このサイトはフォルダへのアクセスを求めています」のような確認を表示します。そのサイト（本アプリ）を信頼できる場合のみ続行してください。",
      "project.folderConfirm.ok": "フォルダを選ぶ",
      "project.folderConfirm.cancel": "キャンセル",
      "project.toast.memberRemoved": "メンバーを削除しました",
      "project.toast.removeFailed": "削除失敗: {message}",

      // ---- upload.err.* (server error codes → translation) ----
      "upload.err.tooManyFiles": "zip 内のファイル数が多すぎます（{max} ファイル以下）。対象を絞り込んでください",
      "upload.err.singleFileTooLarge": "zip 内のファイルが大きすぎます（1ファイル {maxMB}MB 以下）",
      "upload.err.totalTooLarge": "zip の展開後合計サイズが大きすぎます（{maxMB}MB 以下）",
      "upload.err.zipUnreadable": "zip を開けませんでした（破損または非対応形式）",
      "upload.err.noHtml": "zip 内に HTML ファイルがありません",
      "upload.err.ambiguousHtml": "zip 内の HTML が複数あり、主 HTML を特定できません（index.html を含めてください）",
      "upload.err.outputTooLarge": "変換後の HTML が大きすぎます（{maxMB}MB 以下に収まるサイズにしてください）",
      "upload.err.noFile": "ファイルがありません",
      "upload.err.unsupportedType": "対応していない形式です（HTML / Markdown / テキスト / 画像 / zip）",
      "upload.err.tooLarge": "ファイルが大きすぎます（{maxMB}MB 以下）",
      "upload.err.zipNoSaveName": "zip から保存名を取り出せませんでした",

      // ---- header.* ----
      "header.account": "アカウント",
      "header.signout": "ログアウト",
    },
    en: {
      // NOTE: no title keys here — <title> is never translated (JA fixed).
      "index.tab.signin": "Sign in",
      "index.tab.signup": "Sign up",
      "index.label.displayName": "Display name",
      "index.label.email": "Email",
      "index.label.password": "Password",
      "index.submit.signin": "Sign in",
      "index.submit.signup": "Create account",
      "index.or": "or",
      "index.google": "Sign in with Google",
      "index.error.required": "Please enter your email and password.",
      "index.error.generic": "An error occurred.",
      "index.error.google": "Google sign-in failed. Please try again.",
      "index.error.googleUnconfigured": "Google sign-in is not configured.",
      "index.placeholder.displayName": "Jane Doe",
      "index.placeholder.password": "At least 8 characters",

      // ---- dashboard.* ----
      "dashboard.eyebrow": "Projects",
      "dashboard.title": "Projects",
      "dashboard.label.projectName": "Project name",
      "dashboard.label.client": "Client",
      "dashboard.placeholder.projectName": "e.g. My Project spec",
      "dashboard.placeholder.client": "e.g. Example Inc.",
      "dashboard.submit.create": "Create",
      "dashboard.loading": "Loading…",
      "dashboard.empty": "No projects yet.",
      "dashboard.emptyCta": "Create your first project above.",
      "dashboard.open": "Open",
      "dashboard.error.load": "Failed to load projects:",
      "dashboard.error.nameRequired": "Please enter a project name.",
      "dashboard.error.create": "Failed to create project:",
      "dashboard.toast.created": "Project created",

      // ---- account.* ----
      "account.eyebrow": "Account",
      "account.title": "Account settings",
      "account.signedInAs": "Signed in as",
      "account.section.changePassword": "Change password",
      "account.label.currentPassword": "Current password",
      "account.label.newPassword": "New password (at least 8 characters)",
      "account.label.confirmPassword": "Confirm new password",
      "account.submit.change": "Change",
      "account.note.sessions": "Changing your password signs you out on all other devices.",
      "account.error.mismatch": "The confirmation password does not match.",
      "account.error.generic": "Failed to change the password.",
      "account.toast.changed": "Password changed",

      // ---- project.* ----
      "project.eyebrow": "Project",
      "project.loading": "Loading…",
      "project.label.upload": "Upload files",
      "project.chooseFile": "Choose files",
      "project.chooseFolder": "Choose folder",
      "project.note.folder": "Folder pick/drop is zipped in the browser before upload (desktop browsers; not available on some mobile browsers).",
      "project.uploadingFolder": "Zipping folder… {count} files",
      "project.uploadingFolderDone": "Zip ready ({count} files) — uploading",
      "project.error.folderEmpty": "No uploadable files (everything was excluded)",
      "project.error.folderTooMany": "Too many files ({count}). Please narrow it down",
      "project.error.folderTooLarge": "Folder is too large (limit: 20MB total)",
      "project.error.folderZip": "Failed to zip the folder",
      "project.noFile": "No file chosen",
      "project.submit.upload": "Upload",
      "project.dropHint": "You can also drop files here",
      "project.note.versions": "Re-uploading a file with the same name saves it as a new version.",
      "project.section.documents": "Documents",
      "project.section.members": "Members",
      "project.label.email": "Email",
      "project.label.name": "Display name",
      "project.placeholder.name": "Jane Client",
      "project.label.role": "Role",
      "project.role.client_commenter": "Can comment",
      "project.role.client_viewer": "View only",
      "project.role.owner": "Owner",
      "project.submit.invite": "Invite",
      "project.note.invite": "Inviting an unregistered email issues a temporary password.",
      "project.copy": "Copy",
      "project.pw.note": "This password can be changed after the first sign-in. Share it securely.",
      "project.error.notFound": "Project not found",
      "project.docs.empty": "No documents yet.",
      "project.docs.lastUpdated": "Last updated: {date}",
      "project.docs.versions": "{count} versions",
      "project.docs.version": "{count} version",
      "project.docs.download": "Download",
      "project.docs.delete": "Delete",
      "project.error.download": "Download failed",
      "project.filesCount": "{count} files selected",
      "project.error.noFile": "Please choose a file",
      "project.upload.done": "Done: {count} succeeded",
      "project.upload.doneFail": "Done: {ok} succeeded / {fail} failed",
      "project.confirm.deleteDoc": "Delete document",
      "project.confirm.deleteDocMsg": "Delete \"{name}\"?\nAll {count} versions and their comments will be deleted.",
      "project.confirm.deleteOk": "Delete",
      "project.toast.deleted": "Deleted \"{name}\"",
      "project.toast.deletePartial": "Some deletions failed ({fail}/{count})",
      "project.members.empty": "No client members yet.",
      "project.remove": "Remove",
      "project.pwreset": "Reset PW",
      "project.you": "You",
      "project.error.emailRequired": "Please enter an email address",
      "project.pw.created": "Created account for {email}",
      "project.toast.memberAdded": "Account created and added as a member",
      "project.toast.existing": "Existing account added as a member",
      "project.toast.copied": "Copied",
      "project.toast.copyFailed": "Copy failed — please select manually",
      "project.confirm.resetPw": "Reset password",
      "project.confirm.resetPwMsg": "Reset the password for {email}?\nAll existing login sessions will be invalidated.",
      "project.confirm.resetOk": "Reset",
      "project.pw.newPw": "New password for {email}",
      "project.toast.pwReset": "Password reset",
      "project.confirm.removeMember": "Remove member",
      "project.confirm.removeMemberMsg": "Remove this member from the project?",
      "project.confirm.removeOk": "Remove",
      "project.folderConfirm.title": "Upload this folder?",
      "project.folderConfirm.message": "Picking a folder packs its contents into a ZIP and uploads it to this project. After you choose, your browser will show a prompt like \u201cthis site is requesting access to a folder.\u201d Continue only if you trust this site.",
      "project.folderConfirm.ok": "Choose folder",
      "project.folderConfirm.cancel": "Cancel",
      "project.toast.memberRemoved": "Member removed",
      "project.toast.removeFailed": "Removal failed: {message}",

      // ---- upload.err.* (server error codes → translation) ----
      "upload.err.tooManyFiles": "Too many files in the zip (limit: {max}). Please narrow it down",
      "upload.err.singleFileTooLarge": "A file in the zip is too large (limit: {maxMB}MB each)",
      "upload.err.totalTooLarge": "The zip expands to too much data (limit: {maxMB}MB)",
      "upload.err.zipUnreadable": "Could not read the zip (corrupted or unsupported)",
      "upload.err.noHtml": "No HTML file found in the zip",
      "upload.err.ambiguousHtml": "Multiple HTML files in the zip; can't pick the main one (include an index.html)",
      "upload.err.outputTooLarge": "The generated HTML is too large (keep it under {maxMB}MB)",
      "upload.err.noFile": "No file provided",
      "upload.err.unsupportedType": "Unsupported file type (HTML / Markdown / text / image / zip)",
      "upload.err.tooLarge": "File is too large (limit: {maxMB}MB)",
      "upload.err.zipNoSaveName": "Could not derive a save name from the zip",

      // ---- header.* ----
      "header.account": "Account",
      "header.signout": "Sign out",
    },
  };

  function getLang() {
    let saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* private mode etc. */ }
    if (saved === "ja" || saved === "en") return saved;
    const nav = navigator.language || "";
    return nav.startsWith("ja") ? "ja" : "en";
  }

  function t(key, params) {
    const lang = getLang();
    let text = locales[lang] && locales[lang][key];
    if (text == null) text = locales.ja[key];       // fallback: ja dictionary
    if (text == null) return key;                   // fallback: the key itself (never throw)
    if (params) {
      text = text.replace(/\{(\w+)\}/g, (m, name) =>
        params[name] != null ? String(params[name]) : m);
    }
    return text;
  }

  // Bulk re-apply. textContent ONLY (never innerHTML — XSS policy).
  // <title> is deliberately left untouched: brand/title stay Japanese.
  function apply(root) {
    const scope = root || document;
    scope.querySelectorAll("[data-i18n]").forEach(el => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    scope.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
      el.placeholder = t(el.getAttribute("data-i18n-placeholder"));
    });
    scope.querySelectorAll("[data-i18n-title]").forEach(el => {
      el.title = t(el.getAttribute("data-i18n-title"));
    });
    scope.querySelectorAll("[data-i18n-aria-label]").forEach(el => {
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria-label")));
    });
    // Re-translate currently-displayed error messages (set via showError).
    scope.querySelectorAll("[data-i18n-error]").forEach(el => {
      el.textContent = t(el.dataset.i18nError);
    });
  }

  // ---- change subscribers (page-local UI reacts without wrapping setLang) ----
  const listeners = [];
  function onChange(cb) {
    if (typeof cb === "function") listeners.push(cb);
  }

  // Error-message re-translation: pages call showError(el, key) so the message
  // follows language switches. The key lives on the element's dataset and is
  // re-translated by every apply() (setLang calls apply()).
  function showError(el, key) {
    if (!el) return;
    el.dataset.i18nError = key;
    el.textContent = t(key);
  }
  function clearError(el) {
    if (!el) return;
    delete el.dataset.i18nError;
    el.textContent = "";
  }

  function setLang(lang) {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* ignore */ }
    document.documentElement.lang = lang;
    apply();
    listeners.slice().forEach(cb => { try { cb(lang); } catch (e) { /* isolate */ } });
  }

  // Initial paint: fill every [data-i18n*] element once the DOM is ready.
  // Registered before brand.js loads, so this listener runs first.
  document.addEventListener("DOMContentLoaded", () => {
    document.documentElement.lang = getLang();
    apply();
  });

  return { getLang, setLang, t, apply, onChange, showError, clearError };
})();
window.I18N = I18N;
