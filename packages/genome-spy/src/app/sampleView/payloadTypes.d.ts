import { Sample } from "./sampleState";
import { AttributeIdentifier } from "./types";

export interface SetSamples {
    samples: Sample[];
}

export interface PayloadWithAttribute {
    attribute: AttributeIdentifier;
}

export interface SortBy extends PayloadWithAttribute {}

export interface RetainFirstOfEach extends PayloadWithAttribute {}

export interface RemoveUndefined extends PayloadWithAttribute {}

export interface GroupByNominal extends PayloadWithAttribute {}

export interface GroupToQuartiles extends PayloadWithAttribute {}

export interface FilterByQuantitative extends PayloadWithAttribute {
    /** The comparison operator */
    operator: "lt" | "lte" | "eq" | "gte" | "gt";

    operand: number;
}

export interface FilterByNominal extends PayloadWithAttribute {
    values: any[];

    /** Should the matching samples be removed instead of retained (default) */
    remove?: boolean;
}
