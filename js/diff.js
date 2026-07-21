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

// Longest common subsequence over tokens → ops: equal/add/del
function diffTokens(aTokens, bTokens) {
  const n = aTokens.length, m = bTokens.length;
  // Guard against pathological sizes (LCS is O(n*m))
  if (n * m > 4_000_000) {
    return [{ type: "del", tokens: aTokens }, { type: "add", tokens: bTokens }];
  }
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = aTokens[i] === bTokens[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);

  const ops = [];
  let i = 0, j = 0;
  const push = (type, tok) => {
    const last = ops[ops.length - 1];
    if (last && last.type === type) last.tokens.push(tok);
    else ops.push({ type, tokens: [tok] });
  };
  while (i < n && j < m) {
    if (aTokens[i] === bTokens[j]) { push("equal", aTokens[i]); i++; j++; }
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
      if (str.trim()) marks.push({ start: pos, end: pos + str.length, type: "add" });
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
