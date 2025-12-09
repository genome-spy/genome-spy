import { scalar } from "@genome-spy/core/utils/domainArray.js";
import { AttributeIdentifier } from "./types.js";
import { PayloadAction } from "@reduxjs/toolkit";

export type SampleId = string;

/**
 * Sample metadata
 */
export interface Sample {
    id: SampleId;

    displayName: string;

    /** For internal use. Identifies the sample facet efficiently. */
    indexNumber: number;
}

export type Metadatum = Record<string, scalar>;
export type Metadata = Record<SampleId, Metadatum>;

export interface BaseGroup {
    /** e.g., an attribute value that forms a group. Used as a key when identifying subgroups. */
    name: string;

    /** A descriptive title for the group. May contain quantile intervals, etc. */
    title: string;
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
        ids: SampleId[];
        entities: Record<SampleId, Sample>;
    };

    sampleMetadata: {
        /** SampleIds as keys, attributes as values */
        entities: Metadata;
        /** Names of all available metadata attributes */
        attributeNames: string[];
    };

    /** Metadata for each hierarchy level. Does not include the root. */
    groupMetadata: GroupMetadata[];

    /** The root of the hierarchy */
    rootGroup: Group;

    // TODO: Extract this into a separate interface
    lastAction?: PayloadAction;
}
