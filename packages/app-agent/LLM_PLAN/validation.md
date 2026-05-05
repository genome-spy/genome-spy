# Tool Validation

Short current-state note for tool rejection and retry policy.

## Current Policy

- Validate tool calls before execution.
- Reject malformed calls with a clear message.
- Record the rejection in the transcript.
- Retry once after a rejection, then stop if the same invalid call repeats.
- Keep the Python relay thin; validation lives in the app.

## Implemented In

- [`actionShapeValidator.js`](../src/agent/actionShapeValidator.js)
- [`intentProgramValidator.js`](../src/agent/intentProgramValidator.js)
- [`intentProgramExecutor.js`](../src/agent/intentProgramExecutor.js)
- [`agentSessionController.js`](../src/agent/agentSessionController.js)
- [`toolCatalog.js`](../src/agent/toolCatalog.js)

## Notes

The current code already rejects invalid intent batches, records rejected tool
results, and stops repeated invalid call loops. Keep future changes aligned
with that behavior.
