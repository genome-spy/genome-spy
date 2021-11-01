import { Group } from "./sampleState";
import { LocSize } from "../../utils/layout/flexLayout";

export interface KeyAndLocation<T> {
    key: T;
    locSize: LocSize;
}

export interface GroupLocation extends KeyAndLocation<Group[]> {}
export interface SampleLocation extends KeyAndLocation<string> {}

export interface GroupDetails {
    index: number;
    group: Group;
    depth: number;
    n: number;
    attributeLabel: string;
}

export interface HierarchicalGroupLocation
    extends KeyAndLocation<GroupDetails> {}
