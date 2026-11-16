# Working with the user on a creative build

What this build taught about the collaboration itself.

- **The bar is "a great designer would ship this", not "the tests pass".** Expect visual critique ("dummy", "naive", "unpolished") and treat it as the spec. Before showing anything, inspect it yourself in close-up and from the player's real viewpoint.
- **They're often watching the live app while you work.** Say plainly when the running build is old and the fix isn't merged yet ("what you see is the old build"). Don't let them review stale output without knowing.
- **Status in a sentence or two**, then keep working: what you're doing, what's blocked, what's next. When they ask "what's the status of X", answer X first.
- **Ask, with options, only when it's theirs to decide:** spending money, creating accounts, style direction, publishing. Give 2–4 concrete options with trade-offs and a recommendation (AskUserQuestion). Don't build a paid path before asking.
- **When they ask "how", give exact steps and direct links**, numbered, with the exact terminal command. Make sure secrets (API tokens) go into a gitignored file **from their own terminal**, never through chat.
- **When they ask "did you try alternatives?", answer with a tried/not-tried list**, then actually try the untried ones before replying further.
- **When they hand you research** (pasted search results, links), evaluate it against the constraints (GPU, budget, licence) in a short table: use, backup, not applicable and why. Act on the useful parts immediately.
- **Honest limits:** say what is good, what is still not film-grade, and what only a headset or more GPU quota can fix. Never claim a fix you haven't verified with a screenshot or test.
- **Explain causes in user terms** when a defect was real ("the eyes weren't attached to the head bone"). It builds trust that the fix is real, not a tweak.
- **Respect "don't spend".** Exhaust free paths (CC0 libraries, free HF quota, procedural, user-assisted downloads) and say clearly when a free quota is the bottleneck and when it resets.
