import { Field } from "../spec/transform.js";

export interface FlowBatchBase {
    type: string;
}

/**
 * Indicates that the contents of a new file will be propagated. The fields of
 * the file may or may not differ from the previous file. The data items within
 * a single physical batch must have homogeneous fields. A logical facet can
 * contain several file batches; they do not end or restart the facet.
 *
 * FlowNodes can react to FileBatches and, for example, clear their internal
 * states that expect specific fields in a specific layout. Buffered transforms
 * preserve these boundaries when replaying original rows.
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
 * Flush the preceding facet before forwarding this boundary, or retain the
 * boundary with buffered rows until publication. This is not a whole-flow
 * reset or completion boundary.
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
