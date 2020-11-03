/*
 * Using typescript to define well, types. More convenient than using JSDoc
 */

export type SampleId = string;

export interface BaseGroup {
    /** e.g., an attribute value that forms a group */
    name: string;
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
    name: string;
}

export interface State {
    /** A stack of groups. Does not include the root. */
    groups: GroupMetadata[];

    rootGroup: Group;
}
