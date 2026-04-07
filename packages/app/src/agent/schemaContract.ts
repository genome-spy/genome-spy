import type {
    FilterByNominal,
    FilterByQuantitative,
    GroupByNominal,
    GroupByThresholds,
    GroupToQuartiles,
    RetainFirstNCategories,
    SortBy,
} from "../sampleView/state/payloadTypes.js";
import type { ParamSelector } from "../sampleView/sampleViewTypes.d.ts";

type SetVisibility = {
    key: string;
    visibility: boolean;
};

type RestoreDefaultVisibility = string;

type ParamOrigin = {
    type: "datum";
    view: {
        scope: string[];
        view: string;
    };
    keyField: string;
    key: any;
    intervalSources?: Record<string, { start?: string; end?: string }>;
};

type ParamValue =
    | {
          type: "value";
          value: any;
      }
    | {
          type: "interval";
          intervals: Partial<
              Record<
                  "x" | "y",
                  | [number, number]
                  | [
                        { chrom: string; pos: number },
                        { chrom: string; pos: number },
                    ]
                  | null
              >
          >;
      }
    | {
          type: "point";
          keyFields: string[];
          keys: any[][];
      };

type ParamProvenanceEntry = {
    selector: ParamSelector;
    value: ParamValue;
    origin?: ParamOrigin;
};

export type AgentIntentProgramStep =
    | {
          actionType: "sampleView/sortBy";
          payload: SortBy;
      }
    | {
          actionType: "sampleView/filterByNominal";
          payload: FilterByNominal;
      }
    | {
          actionType: "sampleView/filterByQuantitative";
          payload: FilterByQuantitative;
      }
    | {
          actionType: "sampleView/groupByNominal";
          payload: GroupByNominal;
      }
    | {
          actionType: "sampleView/groupToQuartiles";
          payload: GroupToQuartiles;
      }
    | {
          actionType: "sampleView/groupByThresholds";
          payload: GroupByThresholds;
      }
    | {
          actionType: "sampleView/retainFirstNCategories";
          payload: RetainFirstNCategories;
      }
    | {
          actionType: "paramProvenance/paramChange";
          payload: ParamProvenanceEntry;
      }
    | {
          actionType: "viewSettings/setVisibility";
          payload: SetVisibility;
      }
    | {
          actionType: "viewSettings/restoreDefaultVisibility";
          payload: RestoreDefaultVisibility;
      };

export interface AgentIntentProgram {
    schemaVersion: 1;

    steps: [AgentIntentProgramStep, ...AgentIntentProgramStep[]];

    rationale?: string;

    needsConfirmation?: boolean;
}
