import { Action } from "./provenance";
import { ComplexDomain, ScalarDomain } from "../spec/scale";

export interface UrlHash {
    actions?: Action[];
    scaleDomains?: Record<string, ScalarDomain | ComplexDomain>;
}

export interface DependencyQueryDetails {
    /** Name of the queried dependency */
    name: string;
    /** Callback that will set the dependency. */
    setter: (dependency: any) => void;
}

export type DependencyQueryEvent = CustomEvent<DependencyQueryDetails>;
