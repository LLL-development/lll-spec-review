// ============================================================
// lll-spec-review — worker/notify.js
// New-comment notifications: email (Resend) + webhook (Lorely
// or anything Slack-compatible that accepts {"text": ...}).
//
// Everything here is fire-and-forget and OPTIONAL:
//  - No RESEND_API_KEY secret      → email silently skipped
//  - No NOTIFY_WEBHOOK_URL secret  → webhook silently skipped
// A notification failure must never fail the comment POST —
// callers run this via ctx.waitUntil() after responding.
//
// Config (wrangler.jsonc "vars" / dashboard secrets):
//   APP_URL            var     e.g. https://lll-spec-review.xxx.workers.dev
//   BRAND_NAME         var     e.g. 朱入れ
//   MAIL_FROM          var     e.g. review@yourdomain.com (Resend-verified)
//   RESEND_API_KEY     secret
//   NOTIFY_WEBHOOK_URL secret  (may contain a token → keep it a secret)
// ============================================================

// Everyone who should hear about a comment on this document:
// project members + project creator + document uploader,
// minus the comment's author, deduped.
async function recipients(db, doc, authorId) {
  const { results } = await db.prepare(
    `SELECT DISTINCT u.id, u.email, u.display_name
       FROM users u
      WHERE u.id != ?
        AND (
          u.id IN (SELECT user_id FROM project_members WHERE project_id = ?)
          OR u.id = (SELECT created_by FROM projects WHERE id = ?)
          OR u.id = ?
        )`
  ).bind(authorId, doc.project_id, doc.project_id, doc.uploaded_by).all();
  return results;
}

function buildTexts(env, { project, doc, author, body, isReply }) {
  const brand = env.BRAND_NAME || "Spec Review";
  const url = `${(env.APP_URL || "").replace(/\/$/, "")}/viewer.html?doc=${doc.id}`;
  const excerpt = body.length > 200 ? body.slice(0, 200) + "…" : body;
  const kind = isReply ? "返信" : "コメント";
  const subject = `【${brand}】${project.name} / ${doc.filename} に新しい${kind}`;
  const text =
    `${author.display_name} さんが「${project.name} / ${doc.filename}」に${kind}しました:\n\n` +
    `${excerpt}\n\n` +
    `確認する → ${url}\n`;
  return { subject, text, url };
}

async function sendEmails(env, to, subject, text) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM || !to.length) return;
  // One request per recipient — hides the recipient list and
  // keeps us well inside free-tier limits for a review tool.
  for (const r of to) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: env.MAIL_FROM, to: [r.email], subject, text }),
      });
    } catch (e) {
      console.error("email failed", r.email, e);
    }
  }
}

async function sendWebhook(env, text) {
  if (!env.NOTIFY_WEBHOOK_URL) return;
  try {
    await fetch(env.NOTIFY_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    console.error("webhook failed", e);
  }
}

// The one entry point. Never throws.
export async function notifyNewComment(env, { project, doc, author, body, isReply }) {
  try {
    const { subject, text } = buildTexts(env, { project, doc, author, body, isReply });
    const to = await recipients(env.DB, doc, author.id);
    await Promise.all([
      sendEmails(env, to, subject, text),
      sendWebhook(env, `${subject}\n${text}`),
    ]);
  } catch (e) {
    console.error("notifyNewComment failed", e);
  }
}
