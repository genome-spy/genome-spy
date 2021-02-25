import { Field } from "../spec/transform";

export interface FlowBatchBase {
    type: string;
}

/**
 * Indicates that the contents of a new file will be propagated. The fields of
 * the file may or may not differ from the previous file. The data items within
 * a single batch must have homogenous fields.
 *
 * FlowNodes can react to FileBatches and, for example, clear their internal
 * states that expect specific fields in a specific layout.
 */
export interface FileBatch {
    type: "file";

    /**
     * An absolute or relative url where the file was loaded from.
     */
    url?: string;
}

/**
 * Indicates that a new group/facet will be propagated. All data items that
 * belong to a specific facet must be propagated within a single batch.
 */
export interface FacetBatch {
    type: "facet";

    facetId: any | any[];

    /**
     * The field or fields that were used for partitioning the data.
     * May be missing if partitioning is not based on the fields.
     */
    facetField?: Field | Field[];
}

export type FlowBatch = FileBatch | FacetBatch;
