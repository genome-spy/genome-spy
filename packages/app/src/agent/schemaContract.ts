import type { AgentIntentProgramStep } from "./generatedActionTypes.js";

export interface AgentIntentProgram {
    schemaVersion: 1;

    steps: [AgentIntentProgramStep, ...AgentIntentProgramStep[]];

    rationale?: string;
}
