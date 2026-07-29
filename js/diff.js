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
  if (n * m > 4_000_000) {
    return [{ type: "del", tokens: aTokens }, { type: "add", tokens: bTokens }];
  }
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = aKeys[i] === bKeys[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);

  const ops = [];
  let i = 0, j = 0;
  const pushEqual = (aTok, bTok) => {
    const last = ops[ops.length - 1];
    if (last && last.type === "equal") { last.tokens.push(bTok); last.oldTokens.push(aTok); }
    else ops.push({ type: "equal", tokens: [bTok], oldTokens: [aTok] });
  };
  const pushOther = (type, tok) => {
    const last = ops[ops.length - 1];
    if (last && last.type === type) last.tokens.push(tok);
    else ops.push({ type, tokens: [tok] });
  };
  while (i < n && j < m) {
    if (aKeys[i] === bKeys[j]) { pushEqual(aTokens[i], bTokens[j]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { pushOther("del", aTokens[i]); i++; }
    else { pushOther("add", bTokens[j]); j++; }
  }
  while (i < n) pushOther("del", aTokens[i++]);
  while (j < m) pushOther("add", bTokens[j++]);
  return ops;
}

// Public: diff two strings → { ops, newMarks, oldMarks }
// newMarks are {start,end,type:"add"} char offsets into NEW text.
// oldMarks are {start,end,type:"del",pure} char offsets into OLD text.
// pure:true means nothing replaced this text (safe to show as a
// standalone deletion). pure:false means an "add" op sits directly
// next to it — this del is really one side of a replacement, and
// should be shown via its paired addition instead, not as a deletion.
function diffText(oldText, newText) {
  const ops = diffTokens(tokenize(oldText), tokenize(newText));
  const newMarks = [];
  const oldMarks = [];
  let newPos = 0;
  let oldPos = 0;
  for (let idx = 0; idx < ops.length; idx++) {
    const op = ops[idx];
    if (op.type === "add") {
      const str = op.tokens.join("");
      const trimmed = str.trim();
      if (trimmed) {
        const lead = str.length - str.trimStart().length;
        const trail = str.length - str.trimEnd().length;
        newMarks.push({ start: newPos + lead, end: newPos + str.length - trail, type: "add" });
      }
      newPos += str.length;
    } else if (op.type === "del") {
      const str = op.tokens.join("");
      const trimmed = str.trim();
      if (trimmed) {
        const lead = str.length - str.trimStart().length;
        const trail = str.length - str.trimEnd().length;
        const prevType = ops[idx - 1] && ops[idx - 1].type;
        const nextType = ops[idx + 1] && ops[idx + 1].type;
        const pure = prevType !== "add" && nextType !== "add";
        oldMarks.push({ start: oldPos + lead, end: oldPos + str.length - trail, type: "del", pure });
      }
      oldPos += str.length;
    } else if (op.type === "equal") {
      newPos += op.tokens.join("").length;
      oldPos += op.oldTokens.join("").length;
    }
  }
  return { ops, newMarks, oldMarks };
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