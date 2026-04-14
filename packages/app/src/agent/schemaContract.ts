import type { AgentIntentProgramStep } from "./generated/generatedActionTypes.js";

export interface AgentIntentProgram {
    schemaVersion: 1;

    steps: [AgentIntentProgramStep, ...AgentIntentProgramStep[]];

    rationale?: string;
}
