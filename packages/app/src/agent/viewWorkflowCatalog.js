/**
 * @type {Record<import("./types.js").AgentViewWorkflowDefinition["workflowType"], import("./types.js").AgentViewWorkflowDefinition>}
 */
export const viewWorkflowCatalog = {
    deriveMetadataFromSelection: {
        workflowType: "deriveMetadataFromSelection",
        description:
            "Create a sample metadata attribute from a field in the current visualization using an active interval selection and a supported aggregation.",
        requiredSlots: [
            "selectionId",
            "fieldId",
            "aggregation",
            "outputTarget",
        ],
        outputTargets: ["sample_metadata"],
    },
    createBoxplotFromSelection: {
        workflowType: "createBoxplotFromSelection",
        description:
            "Create a boxplot from a field in the current visualization using an active interval selection and a supported aggregation.",
        requiredSlots: [
            "selectionId",
            "fieldId",
            "aggregation",
            "outputTarget",
        ],
        outputTargets: ["boxplot"],
    },
};

export function listViewWorkflows() {
    return Object.values(viewWorkflowCatalog);
}

/**
 * @param {string} workflowType
 */
export function getViewWorkflowDefinition(workflowType) {
    return viewWorkflowCatalog[
        /** @type {keyof typeof viewWorkflowCatalog} */ (workflowType)
    ];
}
