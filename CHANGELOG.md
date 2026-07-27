# Changelog

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