import { AttributeIdentifier } from "./types";

/**
 * Sample metadata
 */
export interface Sample {
    id: string;

    displayName: string;

    /** For internal use, mainly for shaders */
    indexNumber: number;

    /** Arbitrary sample specific attributes */
    attributes: Record<string, any>;
}

export type SampleId = Sample["id"];

export interface BaseGroup {
    /** e.g., an attribute value that forms a group. Used as a key when identifying subgroups. */
    name: string;

    /** A descriptive label for the group. May contain quantile intervals, etc. */
    label: string;
}

export interface SampleGroup extends BaseGroup {
    samples: SampleId[];
}

export interface GroupGroup extends BaseGroup {
    groups: Group[];
}

export type Group = SampleGroup | GroupGroup;

export interface GroupMetadata {
    /** e.g., an attribute that is used for partitioning */
    attribute: AttributeIdentifier;
}

export interface SampleHierarchy {
    /** All known samples that are available for use */
    sampleData: {
        ids: string[];
        entities: Record<string, Sample>;
    };

    /** Metadata for each hierarchy level. Does not include the root. */
    groupMetadata: GroupMetadata[];

    /** The root of the hierarchy */
    rootGroup: Group;
}
