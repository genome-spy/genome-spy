import { AttributeIdentifier } from "./types";

export interface SetSamples {
    samples: string[];
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
    action: "retain" | "remove";
    values: any[];
}
