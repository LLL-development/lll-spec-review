# Dependency security maintenance — 2026-10-18

This change refreshes supported dependency ranges and the reproducible lockfile. It adds no product behavior or UI changes. npm audit failed before the update and succeeds after a clean npm ci (Node 22.23.1).

| Package | Installed patched version(s) |
|---|---|
| hono | 4.13.13 |
| undici | 7.29.1 |
| sharp | 0.35.5 |

## Baseline advisories

The following open GitHub Dependabot alerts were captured before this change. Package audit counts differ from advisory counts because several advisories affect one package.

| Alert | Package | Vulnerable range | First fixed version | Advisory |
|---|---|---|---|---|
| [#35](https://github.com/LLL-development/lll-spec-review/security/dependabot/35) | hono | `< 4.13.7` | 4.13.7 | [GHSA-hxh3-vqpv-xpqv](https://github.com/advisories/GHSA-hxh3-vqpv-xpqv) |
| [#34](https://github.com/LLL-development/lll-spec-review/security/dependabot/34) | undici | `>= 7.0.0, < 7.29.1` | 7.29.1 | [GHSA-8436-99hf-9mmv](https://github.com/advisories/GHSA-8436-99hf-9mmv) |
| [#33](https://github.com/LLL-development/lll-spec-review/security/dependabot/33) | undici | `>= 7.0.0, < 7.29.1` | 7.29.1 | [GHSA-2jfj-6hjv-fm6j](https://github.com/advisories/GHSA-2jfj-6hjv-fm6j) |
| [#32](https://github.com/LLL-development/lll-spec-review/security/dependabot/32) | undici | `>= 7.0.0, < 7.29.1` | 7.29.1 | [GHSA-r53p-7pc4-xj5r](https://github.com/advisories/GHSA-r53p-7pc4-xj5r) |
| [#29](https://github.com/LLL-development/lll-spec-review/security/dependabot/29) | undici | `>= 7.1.0, < 7.29.1` | 7.29.1 | [GHSA-2gqq-gqf2-x968](https://github.com/advisories/GHSA-2gqq-gqf2-x968) |
| [#28](https://github.com/LLL-development/lll-spec-review/security/dependabot/28) | undici | `>= 7.11.0, < 7.29.1` | 7.29.1 | [GHSA-pmjh-fq2x-6v4x](https://github.com/advisories/GHSA-pmjh-fq2x-6v4x) |
| [#26](https://github.com/LLL-development/lll-spec-review/security/dependabot/26) | undici | `>= 7.24.1, < 7.29.1` | 7.29.1 | [GHSA-w293-vg96-wgc3](https://github.com/advisories/GHSA-w293-vg96-wgc3) |
| [#24](https://github.com/LLL-development/lll-spec-review/security/dependabot/24) | sharp | `< 0.35.4` | 0.35.4 | [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) |
| [#23](https://github.com/LLL-development/lll-spec-review/security/dependabot/23) | hono | `< 4.13.5` | 4.13.5 | [GHSA-gqvv-2mrq-wpjv](https://github.com/advisories/GHSA-gqvv-2mrq-wpjv) |
| [#22](https://github.com/LLL-development/lll-spec-review/security/dependabot/22) | hono | `< 4.13.5` | 4.13.5 | [GHSA-g6gw-c38x-mqfc](https://github.com/advisories/GHSA-g6gw-c38x-mqfc) |
| [#21](https://github.com/LLL-development/lll-spec-review/security/dependabot/21) | hono | `< 4.13.5` | 4.13.5 | [GHSA-crvj-82cr-hjcx](https://github.com/advisories/GHSA-crvj-82cr-hjcx) |
| [#10](https://github.com/LLL-development/lll-spec-review/security/dependabot/10) | hono | `>= 3.8.0, < 4.12.34` | 4.12.34 | [GHSA-f23p-vx2j-j53r](https://github.com/advisories/GHSA-f23p-vx2j-j53r) |
| [#9](https://github.com/LLL-development/lll-spec-review/security/dependabot/9) | hono | `>= 4.7.0, < 4.12.34` | 4.12.34 | [GHSA-79qm-7rj5-m7r9](https://github.com/advisories/GHSA-79qm-7rj5-m7r9) |
| [#8](https://github.com/LLL-development/lll-spec-review/security/dependabot/8) | hono | `>= 4.12.0, < 4.12.34` | 4.12.34 | [GHSA-54fx-42gc-7vw4](https://github.com/advisories/GHSA-54fx-42gc-7vw4) |
| [#7](https://github.com/LLL-development/lll-spec-review/security/dependabot/7) | hono | `< 4.12.34` | 4.12.34 | [GHSA-8j4g-w8fx-2239](https://github.com/advisories/GHSA-8j4g-w8fx-2239) |
| [#6](https://github.com/LLL-development/lll-spec-review/security/dependabot/6) | undici | `>= 7.0.0, < 7.29.0` | 7.29.0 | [GHSA-m8rv-5g2x-5cg5](https://github.com/advisories/GHSA-m8rv-5g2x-5cg5) |
| [#5](https://github.com/LLL-development/lll-spec-review/security/dependabot/5) | undici | `>= 7.0.0, < 7.29.0` | 7.29.0 | [GHSA-v3r7-h72x-cjcm](https://github.com/advisories/GHSA-v3r7-h72x-cjcm) |
| [#4](https://github.com/LLL-development/lll-spec-review/security/dependabot/4) | undici | `>= 7.0.0, < 7.29.0` | 7.29.0 | [GHSA-jr45-8vmc-qm54](https://github.com/advisories/GHSA-jr45-8vmc-qm54) |
| [#3](https://github.com/LLL-development/lll-spec-review/security/dependabot/3) | undici | `>= 7.0.0, < 7.29.0` | 7.29.0 | [GHSA-8xcm-r25x-g524](https://github.com/advisories/GHSA-8xcm-r25x-g524) |
| [#2](https://github.com/LLL-development/lll-spec-review/security/dependabot/2) | undici | `>= 7.0.0, < 7.29.0` | 7.29.0 | [GHSA-4cwx-7wf7-3272](https://github.com/advisories/GHSA-4cwx-7wf7-3272) |
| [#1](https://github.com/LLL-development/lll-spec-review/security/dependabot/1) | sharp | `< 0.35.0` | 0.35.0 | [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) |

## Verification and deployment

Hono is updated within major 4 to 4.13.13; Wrangler within major 4 to 4.151.1. Wrangler requires Node 22+, matching the existing CI Node 22. Its normal upstream dependency tree selects Miniflare5 beta; this is Wrangler’s own pinned dependency, with no override. Clean npm ci, npm audit=0, npm ls=0, frontend build and Worker deploy dry-run succeeded. Fresh local D1 migrations and R2 exercised signup→project→multipart HTML upload→authenticated fetch→comment→re-read persistence; anonymous project access returns 401. No test script exists. Secure cookie is explicitly replayed by the local HTTP harness. External Google login and notifications were not exercised.

The configured APP_URL is https://lll-spec-review.philip-81c.workers.dev. Existing main-push/manual deployment applies remote migrations and deploys the Worker using CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID, then tags/releases the VERSION. VERSION moves 1.2.0→1.2.1 because the workflow rejects already-tagged versions. The existing duplicate-numbered 0002 migration files both apply successfully to a fresh local DB, but this does not establish the historical remote migration table state. No remote DB write, production deployment or production signup occurred.

## Limits and rollback

npm audit is a dependency advisory check, not a proof that all application security properties are correct. Dependabot alerts are expected to be recalculated after merge; this PR does not dismiss them. Revert this PR to restore the previous dependency tree/workflow configuration (which reintroduces the listed vulnerable versions). Production deployment and remote secret presence require separate verification after review and merge.
