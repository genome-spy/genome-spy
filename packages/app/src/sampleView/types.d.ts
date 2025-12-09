import { SampleHierarchy } from "./sampleState.js";

/**
 * An identifier for an abstract attribute. Allows for retrieving an accessor and information.
 */
export interface AttributeIdentifier {
    type: string;
    specifier?: unknown;
}

export interface AttributeInfo {
    /**
     * A concise name of the attribute: TODO: Used for what?
     * @deprecated Use attribute instead
     */
    name: string;

    attribute: AttributeIdentifier;

    /** More detailed name with optional formatting */
    title?: string | import("lit").TemplateResult;

    /** Function that maps a sampleId to an attribute value */
    accessor: (sampleId: string, sampleHierarchy: SampleHierarchy) => any;

    /** e.g., "quantitative" */
    type: string;

    scale?: any;
}
