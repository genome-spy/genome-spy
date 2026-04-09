/**
 * Supplemental action catalog entries for non-sample Redux slices.
 *
 * Sample collection actions are still generated from the sample slice JSDoc.
 */

/**
 * @typedef {import("./types.d.ts").AgentActionCatalogEntry} AgentActionCatalogEntry
 */

/**
 * @type {AgentActionCatalogEntry[]}
 */
export const supplementalActionCatalogEntries = [
    {
        actionType: "paramProvenance/paramChange",
        description: "Update a bookmarkable parameter.",
        payloadType: "ParamProvenanceEntry",
        payloadDescription:
            "Payload for updating a bookmarkable parameter entry in provenance.",
        payloadFields: [
            {
                name: "selector",
                type: "ParamSelector",
                description: "Structured selector for the parameter.",
                required: true,
            },
            {
                name: "value",
                type: "ParamValue",
                description: "Serialized parameter value.",
                required: true,
            },
            {
                name: "origin",
                type: "ParamOrigin",
                description: "Optional datum origin for replayable values.",
                required: false,
            },
        ],
        examplePayload: {
            selector: {
                scope: [],
                param: "brush",
            },
            value: {
                type: "interval",
                intervals: {
                    x: [
                        { chrom: "chr17", pos: 7685012 },
                        { chrom: "chr17", pos: 7690727 },
                    ],
                },
            },
        },
    },
];
