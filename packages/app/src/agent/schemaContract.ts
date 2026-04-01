import type {
    FilterByNominal,
    FilterByQuantitative,
    GroupByNominal,
    GroupByThresholds,
    GroupToQuartiles,
    RetainFirstNCategories,
    SortBy,
} from "../sampleView/state/payloadTypes.js";

export type AgentIntentProgramStep =
    | {
          actionType: "sortBy";
          payload: SortBy;
      }
    | {
          actionType: "filterByNominal";
          payload: FilterByNominal;
      }
    | {
          actionType: "filterByQuantitative";
          payload: FilterByQuantitative;
      }
    | {
          actionType: "groupByNominal";
          payload: GroupByNominal;
      }
    | {
          actionType: "groupToQuartiles";
          payload: GroupToQuartiles;
      }
    | {
          actionType: "groupByThresholds";
          payload: GroupByThresholds;
      }
    | {
          actionType: "retainFirstNCategories";
          payload: RetainFirstNCategories;
      };

export interface AgentIntentProgram {
    schemaVersion: 1;

    steps: [AgentIntentProgramStep, ...AgentIntentProgramStep[]];

    rationale?: string;

    needsConfirmation?: boolean;
}
