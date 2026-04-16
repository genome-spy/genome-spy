# Examples Map

Use `utils/agent_server/EXAMPLES.md` as a companion guide when the code review requires judgment.

## Relevant Sections

- `2. Simplicity First / Example 1: Over-abstraction`
  - Use when reviewing classes, strategies, managers, or excessive scaffolding.
- `2. Simplicity First / Example 2: Speculative Features`
  - Use when reviewing optional hooks, configuration knobs, caching layers, validators, or notifications that were not requested.
- `3. Surgical Changes`
  - Use when deciding whether a simplification would become an unrelated refactor.

## How to Use the Examples

- Compare the target code to the anti-pattern first.
- If the target code resembles the anti-pattern and no strong counterexample is visible, simplify or report it.
- If the target code needs lifecycle, shared state, or multiple implementations, treat the example as guidance rather than a hard rule.
