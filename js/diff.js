// ============================================
// lll-spec-review — js/diff.js
// Minimal LCS word-diff for the "resolve → see what changed" view.
// Operates on the visible TEXT of two document versions.
// Returns segments the viewer turns into diffmarks / a side panel.
// ============================================

// Split into words + whitespace tokens (keeps diffs readable)
function tokenize(text) {
  return text.match(/\s+|[^\s]+/g) || [];
}

// Comparison key for a token: any run of whitespace collapses to a single
// canonical space, so purely incidental whitespace differences (an extra
// trailing space, a newline landing in a slightly different spot) never
// register as a content change and never destabilize the alignment around
// them. Non-whitespace tokens compare exactly as written.
function tokenKey(tok) {
  return /^\s+$/.test(tok) ? " " : tok;
}

// Longest common subsequence over tokens → ops: equal/add/del
function diffTokens(aTokens, bTokens) {
  const n = aTokens.length, m = bTokens.length;
  const aKeys = aTokens.map(tokenKey), bKeys = bTokens.map(tokenKey);
  // Guard against pathological sizes (LCS is O(n*m))
  if (n * m > 4_000_000) {
    return [{ type: "del", tokens: aTokens }, { type: "add", tokens: bTokens }];
  }
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = aKeys[i] === bKeys[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);

  const ops = [];
  let i = 0, j = 0;
  const push = (type, tok) => {
    const last = ops[ops.length - 1];
    if (last && last.type === type) last.tokens.push(tok);
    else ops.push({ type, tokens: [tok] });
  };
  while (i < n && j < m) {
    // Use the NEW side's token on an "equal" match — the tokens can differ
    // slightly in whitespace even when their keys match, and marks/offsets
    // are computed against newText, so its exact characters must be used.
    if (aKeys[i] === bKeys[j]) { push("equal", bTokens[j]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push("del", aTokens[i]); i++; }
    else { push("add", bTokens[j]); j++; }
  }
  while (i < n) push("del", aTokens[i++]);
  while (j < m) push("add", bTokens[j++]);
  return ops;
}

// Public: diff two strings → { ops, addMarks }
// addMarks are {start,end,type} char offsets into the NEW text,
// used to paint highlights in the updated document.
function diffText(oldText, newText) {
  const ops = diffTokens(tokenize(oldText), tokenize(newText));
  const marks = [];
  let pos = 0; // char offset into new text
  for (const op of ops) {
    const str = op.tokens.join("");
    if (op.type === "add") {
      // Trim the mark to the real content within this run — an add-run
      // can end up with a whitespace-only token bundled at its edge
      // (e.g. a trailing newline before the next element), and leaving
      // that in the mark's span lets the highlight spill past its
      // paragraph into whatever structural gap follows.
      const trimmed = str.trim();
      if (trimmed) {
        const lead = str.length - str.trimStart().length;
        const trail = str.length - str.trimEnd().length;
        marks.push({ start: pos + lead, end: pos + str.length - trail, type: "add" });
      }
      pos += str.length;
    } else if (op.type === "equal") {
      pos += str.length;
    }
    // del contributes nothing to new-text offsets
  }
  return { ops, marks };
}

// Render ops to inline HTML for the side-by-side diff panel
function diffToHtml(ops) {
  return ops.map(op => {
    const t = escapeHtml(op.tokens.join(""));
    if (op.type === "add") return `<ins>${t}</ins>`;
    if (op.type === "del") return `<del>${t}</del>`;
    return `<span>${t}</span>`;
  }).join("");
}