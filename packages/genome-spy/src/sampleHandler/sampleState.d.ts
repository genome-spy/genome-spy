/*
 * Using typescript to define well, types. More convenient than using JSDoc
 */

import { AttributeIdentifier } from "./sampleHandler";

export type SampleId = string;

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
    /** A stack of groups. Does not include the root. */
    groups: GroupMetadata[];

    rootGroup: Group;
}
