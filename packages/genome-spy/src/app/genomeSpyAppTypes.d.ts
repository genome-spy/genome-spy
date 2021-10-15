import { Action } from "../sampleHandler/provenance";
import { ComplexDomain, ScalarDomain } from "../spec/scale";

export interface UrlHash {
    actions?: Action[];
    scaleDomains?: Record<string, ScalarDomain | ComplexDomain>;
}
