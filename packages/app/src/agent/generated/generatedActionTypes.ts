/**
 * This file is generated. Do not edit.
 */
import type { AddMetadataFromSource, DeriveMetadata, FilterByNominal, FilterByQuantitative, GroupByNominal, GroupByThresholds, GroupCustom, GroupToQuartiles, ParamProvenanceEntry, RemoveGroup, RemoveUndefined, RetainFirstNCategories, RetainFirstOfEach, RetainMatched, SetMetadata, SortBy } from "../../agentShared/actionPayloadTypes.d.ts";


export type AgentIntentBatchStep =
    | {
          actionType: "sampleView/addMetadata";
          payload: SetMetadata;
      }
    | {
          actionType: "sampleView/deriveMetadata";
          payload: DeriveMetadata;
      }
    | {
          actionType: "sampleView/addMetadataFromSource";
          payload: AddMetadataFromSource;
      }
    | {
          actionType: "sampleView/sortBy";
          payload: SortBy;
      }
    | {
          actionType: "sampleView/retainFirstOfEach";
          payload: RetainFirstOfEach;
      }
    | {
          actionType: "sampleView/retainFirstNCategories";
          payload: RetainFirstNCategories;
      }
    | {
          actionType: "sampleView/filterByQuantitative";
          payload: FilterByQuantitative;
      }
    | {
          actionType: "sampleView/filterByNominal";
          payload: FilterByNominal;
      }
    | {
          actionType: "sampleView/removeUndefined";
          payload: RemoveUndefined;
      }
    | {
          actionType: "sampleView/groupCustomCategories";
          payload: GroupCustom;
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
          actionType: "sampleView/removeGroup";
          payload: RemoveGroup;
      }
    | {
          actionType: "sampleView/retainMatched";
          payload: RetainMatched;
      }
    | {
          actionType: "paramProvenance/paramChange";
          payload: ParamProvenanceEntry;
      };

export type AgentActionType = AgentIntentBatchStep["actionType"];
