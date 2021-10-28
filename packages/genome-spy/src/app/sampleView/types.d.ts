import { SampleHierarchy } from "./sampleState";

/**
 * An identifier for an abstract attribute. Allows for retrieving an accessor and information.
 */
export interface AttributeIdentifier {
    type: string;
    specifier?: any;
}

export interface AttributeInfo {
    /** A concise name of the attribute */
    name: string;

    /** More detailed name with optional formatting */
    title?: string | import("lit").TemplateResult;

    /** Function that maps a sampleId to an attribute value */
    accessor: (attribute: string, sampleHierarchy: SampleHierarchy) => any;

    /** e.g., "quantitative" */
    type: string;

    scale: any;
}
