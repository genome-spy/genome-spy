import type { AgentIntentBatchStep } from "./generated/generatedActionTypes.js";

export interface AgentIntentActionRequest {
    actions: [AgentIntentBatchStep, ...AgentIntentBatchStep[]];

    note?: string;
}

export interface AgentIntentBatch {
    schemaVersion: 1;

    steps: [AgentIntentBatchStep, ...AgentIntentBatchStep[]];

    rationale?: string;
}
