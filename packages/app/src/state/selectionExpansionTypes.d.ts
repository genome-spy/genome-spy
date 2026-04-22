import type { Scalar } from "@genome-spy/core/spec/channel.js";

export type SelectionLeafValue = Scalar | null;

export type SelectionExpansionLeafPredicate =
    | {
          field: string;
          op: "eq";
          value: SelectionLeafValue;
      }
    | {
          field: string;
          op: "eq";
          valueFromField: string;
      }
    | {
          field: string;
          op: "in";
          values: SelectionLeafValue[];
      };

export type LogicalAnd = {
    and: SelectionExpansionPredicate[];
};

export type LogicalOr = {
    or: SelectionExpansionPredicate[];
};

export type LogicalNot = {
    not: SelectionExpansionPredicate;
};

export type SelectionExpansionPredicate =
    | SelectionExpansionLeafPredicate
    | LogicalAnd
    | LogicalOr
    | LogicalNot;

export type SelectionExpansionRule = {
    kind: "sameFieldValue";
    field: string;
};

export type SelectionExpansionMatcher =
    | SelectionExpansionPredicate
    | SelectionExpansionRule;

export type ResolvedSelectionExpansionLeafPredicate =
    | {
          field: string;
          op: "eq";
          value: SelectionLeafValue;
      }
    | {
          field: string;
          op: "in";
          values: SelectionLeafValue[];
      };

export type ResolvedLogicalAnd = {
    and: ResolvedSelectionExpansionPredicate[];
};

export type ResolvedLogicalOr = {
    or: ResolvedSelectionExpansionPredicate[];
};

export type ResolvedLogicalNot = {
    not: ResolvedSelectionExpansionPredicate;
};

export type ResolvedSelectionExpansionPredicate =
    | ResolvedSelectionExpansionLeafPredicate
    | ResolvedLogicalAnd
    | ResolvedLogicalOr
    | ResolvedLogicalNot;
