# Changelog

## 1.1.0 — text-range comments & version diff

- Comments can now anchor to a **highlighted text range** (not just a clicked
  element). Tap a comment to fly to its spot.
- **変更を確認 / See changes**: from a comment, jump to its anchor in the latest
  version and highlight what changed there (word-level diff for text formats).
- **🔀 Diff bar**: pick any two versions to compare; added text is highlighted
  in the document, with an inline add/remove legend.
- Adopted the archquest-style deploy toolchain: `VERSION` file with deploy-time
  bump enforcement, `deploy.sh` Termux deployer, wrangler migrations, and
  automatic git tag + GitHub release per deploy.

## 1.0.0 — baseline

Viewer, pin comments, threads, client invites with generated passwords,
Google login, email/webhook notifications, multi-format uploads, document
deletion, styled modals + file picker + favicon.
