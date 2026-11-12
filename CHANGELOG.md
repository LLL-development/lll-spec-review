# Changelog

## 1.2.4 — folder upload & higher file limit

- Added **folder upload**: pick or drop a whole folder and the browser packs
  it into a zip on the spot, reusing the existing zip upload path — no need
  to build a zip by hand anymore. One-off file selection and manual zip
  uploads work exactly as before.
- Common noise is skipped when packing a folder: `.git`, `node_modules`,
  `.DS_Store`, and `__MACOSX` entries are excluded.
- Raised the server-side zip file-count limit from **200 to 5000** so
  file-heavy zips (e.g. e-books) go through; zip bomb size limits
  (25MB total expanded, 8MB per file, 10MB output) are unchanged.
- Folder picking/dropping targets desktop browsers; mobile may not support
  it (noted in the UI).

## 1.2.3 — zip upload (self-contained mock)

- Added **zip upload**: uploading a zip of a mock (HTML + CSS/JS/images)
  builds a **single self-contained HTML** by inlining relative references
  (CSS/JS/images) with their real data, then stores it like any other
  document. Clients can view the finished mock with styles and scripts
  applied, alongside the existing redline comments, diff, and version
  history.
- One-off HTML/Markdown/text/image uploads work exactly as before — zip is a
  new path; existing upload behavior is unchanged.
- Multiple pages inside the zip are not embedded: links to other HTML files
  (e.g. `<a href="about.html">`) pass through untouched; page navigation is
  not supported (single-document viewer).
- Scripts with `defer`/`async`/`type="module"` and external references
  (http/https/data: CDNs) are not transformed — they pass through as-is.
- Added the `fflate` dependency for zip extraction, with zip bomb/size limits
  and zip slip protections.

## 1.2.2 — CI: deploy on Node 22

- Bumped the deploy workflow's setup-node from 20 to 22, since the latest
  Wrangler requires Node.js >= 22; this resolves the failure in the
  "Apply database migrations" step.
- No application feature or UI changes in this release.

## 1.2.1 — dependency security updates

- Update Hono to 4.13.13 and Wrangler to 4.151.1, resolving the dependency audit advisories without changing application features.

## 1.2.0 — download & fullscreen

- Added a **⬇ ダウンロード / Download** button to each document row in the
  project list view, saving the document as an .html file with its
  original filename.
- Added a **⛶ フルスクリーン / Fullscreen** button to the viewer toolbar,
  expanding the document into true browser fullscreen (Esc to exit),
  reachable whether Diff mode is open or closed.
- Fixed the diff-bar showing on every page load regardless of Diff
  toggle state — `.diff-bar` had an unconditional `display: flex`
  overriding the `hidden` attribute, the same category of bug as the
  1.1.1 reply-box fix. It now only appears when 🔀 変更を見る/Diff is
  clicked, as intended.

## 1.1.1 — reply draft persistence

- Fixed reply-box drafts being silently lost during the 15s comment
  auto-poll or when switching tabs and back — draft text and the open/closed
  state of a reply box now survive the comment-thread re-render both trigger.
- Fixed a related bug where opening a reply on one comment didn't close a
  reply box already open on another, allowing multiple boxes to appear open
  at once.
- Fixed the underlying CSS issue where `.reply-box` had an unconditional
  `display: flex`, overriding the `hidden` attribute so a reply box could
  render visible even when it shouldn't.

## 1.1.0 — text-range comments & version diff

- Comments can now anchor to a **highlighted text range** (not just a clicked
  element). Tap a comment to fly to its spot.
- **変更を確認 / See changes**: from a comment, jump to its anchor in the latest
  version and highlight what changed there (word-level diff for text formats).
- **解決 / Resolve** now also jumps to the change and highlights it — the same
  "see what changed" behavior, triggered from the natural point of confirming
  a fix rather than a separate button.
- **🔀 Diff bar**: pick any two versions to compare; added text is highlighted
  in the document, with an inline add/remove legend.
- Diff highlighting accuracy fixes: consistent text extraction between old/new
  versions (was mixing rendered and unrendered text, causing spurious huge
  highlights), whitespace-tolerant comparison (a stray space or newline no
  longer misaligns the diff), highlight marks now persist instead of vanishing
  after ~1s, and the whole changed phrase flashes together instead of just the
  first word.
- Adopted the archquest-style deploy toolchain: `VERSION` file with deploy-time
  bump enforcement, `deploy.sh` Termux deployer, wrangler migrations, and
  automatic git tag + GitHub release per deploy.

## 1.0.0 — baseline

Viewer, pin comments, threads, client invites with generated passwords,
Google login, email/webhook notifications, multi-format uploads, document
deletion, styled modals + file picker + favicon.