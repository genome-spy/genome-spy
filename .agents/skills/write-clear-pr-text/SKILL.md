---
name: write-clear-pr-text
description:
  Draft, rewrite, and check pull request titles, descriptions, reviews, and
  comments for clear, self-contained language before posting or editing them.
  Includes review replies and recording comments.
---

# Write clear PR text

Write for a repository contributor who knows the project but has not followed
the work. They should understand the problem, proposed change and remaining
concerns without decoding implementation notes or reading the chat history.

Use this skill before posting or updating agent-authored PR text, including
inline reviews, replies and recording comments. Apply it to local drafts too. It
governs writing, not permission to publish or resume paused work.

## Start with what the reader needs

- For a fix, describe what goes wrong and when, then what will happen after the
  change. For a refactor, explain the maintenance problem and why the new
  arrangement is simpler or safer. Name the reason; do not merely claim
  "architectural fit."
- For a review reply, answer the question or request first. Explain the change
  and relevant verification. If the request is unresolved, say so directly.
- For an experiment, lead with the conclusion and its consequence: proceed,
  revise, or stop. Separate what worked from what failed.
- For a recording, say what to watch, which side is before/after, and whether it
  shows the current version. A video does not establish performance or
  correctness beyond what it actually demonstrates.
- State draft status, blockers, required earlier PRs and material limitations
  near the beginning when they affect whether the change can be reviewed or
  merged. Do not make the reader discover them in a footnote.

## Use technical detail to explain a decision

- Prefer concrete behavior and familiar verbs. For example, say "an invisible
  circle blocks selection" rather than "invalid geometry steals picking."
- Keep exact API names, error messages and code references when needed. Explain
  unfamiliar terms on first use. Technical precision is welcome; unexplained
  abbreviations, invented labels and dense chains of nouns are not.
- Include implementation details only when they help the reader judge
  correctness, ownership, compatibility, cost or a tradeoff. An inline review
  may need a precise formula; explain the consequence before giving it.
- Do not recount the investigation, list every discarded approach, or repeat
  information already available in the diff. Link to a focused report when its
  detail is useful; do not reproduce the report or dump it into a collapsed
  section.
- Keep revision hashes, file lists and exact line counts out of the opening.
  Include them later only when requested or needed to identify the reviewed
  change. Use descriptive links instead of chains of PR numbers.

## Explain evidence without overselling it

- Say what behavior was checked and in which relevant environments. Test counts,
  tool names and agent approvals do not explain what the evidence proves. Do not
  use them as substitutes for that explanation.
- Preserve failures, untested cases and uncertainty that affect review. Do not
  turn a partial proof into a general claim or describe a draft as ready.
- Use measurements when the decision depends on them. Explain what was measured,
  the comparison and its limits. Keep the few numbers needed for the decision;
  link the full results. Do not claim a speedup when the outputs differ.
- Keep local verification distinct from CI, and distinguish completed work from
  planned work. Do not infer either from an old description or recording.

## Keep the text proportional

A small fix usually needs a short problem/change explanation and a brief
verification note. A review reply may need only a sentence. Add structure or
detail when the change warrants it; there is no mandatory template or word
count. Use short paragraphs and parallel bullets, with one main point per
paragraph. Avoid repeated scope disclaimers, checklists of routine checks and
unrelated "unchanged" claims. Include compatibility boundaries that actually
matter.

Follow the repository's title, formatting and AI-attribution conventions. Do not
invent missing facts to make the text shorter or more persuasive.

## Check the final draft before posting

Read the complete text as someone new to the work:

1. Can they explain the problem and the effect of the change after one reading?
2. Can they tell what is implemented, what was checked and what remains open?
3. Does each technical term or detail help them evaluate the change?
4. Are all material claims supported, with important failures and limits
   visible?

Rewrite if any answer is no. This is a self-check, not a new user-approval step.
