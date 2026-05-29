import { ToolCallRejectionError } from "./agentToolErrors.js";
import { getAttributeSummaryTool } from "./attributeSummaryTool.js";
import { getSelectionFeatureFieldSummaryTool } from "./selectionFeatureFieldSummaryTool.js";
import { resolveMetadataAttributeValuesTool } from "./resolveMetadataAttributeValuesTool.js";
import { searchViewDatumsTool } from "./searchViewDatumsTool.js";
import { getActionCatalogEntry } from "./actionCatalog.js";
import { getIntentActionTypeDocs as getIntentActionTypeDocsContent } from "./intentActionTypeDocs.js";
import { resolveAgentAttributeCandidateRecord } from "./attributeCandidate.js";
import { normalizeAgentIntentActionAttributes } from "./agentIntentActionAttributes.js";
import { formatAgentToolErrorMessage } from "./missingAttributeGuidance.js";

/*
 * Tool behavior lives here. The input shapes and user-facing descriptions are
 * documented in `agentToolInputs.d.ts` and projected into generated artifacts.
 */

/**
 * @typedef {Omit<import("./types.d.ts").AgentAdapter, "requestAgentTurn"> & {
 *     agentApi: import("@genome-spy/app/agentApi").AgentApi;
 *     expandViewNode?(selector: import("@genome-spy/core/view/viewSelectors.js").ViewSelector): boolean;
 *     collapseViewNode?(selector: import("@genome-spy/core/view/viewSelectors.js").ViewSelector): boolean;
 * }} AgentToolRuntime
 */

/**
 * @typedef {{
 *     text: string;
 *     content?: unknown;
 *     summaries?: import("./types.d.ts").IntentBatchSummaryLine[];
 * }} AgentToolExecutionResult
 */

/**
 * Concrete agent tool handlers keyed by agent tool name.
 */
export const agentTools = {
    /**
     * @param {AgentToolRuntime} runtime
     * @param {import("./agentToolInputs.d.ts").ExpandViewNodeToolInput} input
     */
    expandViewNode(runtime, input) {
        return updateViewNodeExpansion(runtime, input.selector, true);
    },

    /**
     * @param {AgentToolRuntime} runtime
     * @param {import("./agentToolInputs.d.ts").CollapseViewNodeToolInput} input
     */
    collapseViewNode(runtime, input) {
        return updateViewNodeExpansion(runtime, input.selector, false);
    },

    /**
     * @param {AgentToolRuntime} runtime
     * @param {import("./agentToolInputs.d.ts").SetViewVisibilityToolInput} input
     */
    setViewVisibility(runtime, input) {
        const selector = input.selector;

        const view = ensureResolvedView(runtime, selector);
        const before = view.isVisible();
        runtime.agentApi.setViewVisibility(selector, input.visibility);
        const after = view.isVisible();

        return {
            text:
                after === before
                    ? "The view was already in the requested visibility state."
                    : "Updated the requested view visibility.",
            content: createViewStateChange(
                "user_visibility",
                "visible",
                selector,
                before,
                after
            ),
        };
    },

    /**
     * @param {AgentToolRuntime} runtime
     * @param {import("./agentToolInputs.d.ts").JumpToProvenanceStateToolInput} input
     */
    jumpToProvenanceState(runtime, input) {
        const actionHistory = runtime.agentApi.getActionHistory();
        if (input.provenanceId === null) {
            return activateInitialProvenanceState(
                runtime,
                actionHistory.length
            );
        }

        const targetIndex = findProvenanceActionIndex(
            actionHistory,
            input.provenanceId
        );
        const provenanceAction =
            /** @type {import("@genome-spy/app/agentShared").ProvenanceAction & { summary?: string }} */ (
                actionHistory[targetIndex]
            );
        const undoneActionCount = actionHistory.length - targetIndex - 1;
        const changed = runtime.agentApi.jumpToProvenanceState(
            input.provenanceId
        );

        return {
            text:
                changed && provenanceAction
                    ? "Jumped to provenance state: " +
                      (provenanceAction.summary ?? provenanceAction.type) +
                      "."
                    : "The requested provenance state was already active. " +
                      "This did not undo or change the analysis. If the user asked to undo, replace, change, swap, or exclude a prior step, choose an earlier provenance state instead of calling this same provenanceId again.",
            content: createProvenanceStateActivation(
                input.provenanceId,
                provenanceAction,
                false,
                changed,
                undoneActionCount
            ),
        };
    },

    /**
     * @param {AgentToolRuntime} runtime
     * @param {import("./agentToolInputs.d.ts").ShowCategoryCountsPlotToolInput} input
     */
    async showCategoryCountsPlot(runtime, input) {
        const attribute = resolveAgentAttributeCandidateRecord(
            runtime,
            input.attribute
        );

        return executeSampleAttributePlot(runtime, {
            plotRequest: {
                plotType: "bar",
                attribute: attribute.plotAttribute,
            },
            attributeRecord: attribute,
        });
    },

    /**
     * @param {AgentToolRuntime} runtime
     * @param {import("./agentToolInputs.d.ts").ShowAttributeDistributionPlotToolInput} input
     */
    async showAttributeDistributionPlot(runtime, input) {
        const attribute = resolveAgentAttributeCandidateRecord(
            runtime,
            input.attribute
        );

        return executeSampleAttributePlot(runtime, {
            plotRequest: {
                plotType: "boxplot",
                attribute: attribute.plotAttribute,
            },
            attributeRecord: attribute,
        });
    },

    /**
     * @param {AgentToolRuntime} runtime
     * @param {import("./agentToolInputs.d.ts").ShowAttributeRelationshipPlotToolInput} input
     */
    async showAttributeRelationshipPlot(runtime, input) {
        const [xPlotAttribute, yPlotAttribute] = input.attributes;
        const xAttribute = resolveAgentAttributeCandidateRecord(
            runtime,
            xPlotAttribute
        );
        const yAttribute = resolveAgentAttributeCandidateRecord(
            runtime,
            yPlotAttribute
        );
        if (
            isSameAttributeIdentifier(
                xAttribute.normalized,
                yAttribute.normalized
            )
        ) {
            throw new ToolCallRejectionError(
                "Relationship plots require two different quantitative attributes. " +
                    "For a distribution of one quantitative attribute by current groups, " +
                    "use showAttributeDistributionPlot with that attribute."
            );
        }

        return executeSampleAttributePlot(runtime, {
            plotRequest: {
                plotType: "scatterplot",
                xAttribute: xAttribute.plotAttribute,
                yAttribute: yAttribute.plotAttribute,
            },
            attributeRecords: [xAttribute, yAttribute],
        });
    },

    getAttributeSummary: getAttributeSummaryTool,
    getSelectionFeatureFieldSummary: getSelectionFeatureFieldSummaryTool,
    resolveMetadataAttributeValues: resolveMetadataAttributeValuesTool,
    searchViewDatums: searchViewDatumsTool,

    /**
     * @param {AgentToolRuntime} _runtime
     * @param {import("./agentToolInputs.d.ts").GetIntentActionDocsToolInput} input
     */
    getIntentActionDocs(_runtime, input) {
        const entry = getActionCatalogEntry(input.actionType);
        if (!entry) {
            throw new ToolCallRejectionError(
                "Unsupported intent actionType " + input.actionType + "."
            );
        }

        const content = {
            actionType: entry.actionType,
            description: entry.description,
            ...(entry.usage ? { usage: entry.usage } : {}),
            payloadFields: entry.payloadFields.map(projectPayloadFieldDoc),
            examples: entry.examples,
            referencedTypes: getReferencedPayloadFieldTypes(
                entry.payloadFields
            ),
        };

        return {
            text:
                "Read docs for " +
                input.actionType +
                ". No action was executed.",
            content,
        };
    },

    /**
     * @param {AgentToolRuntime} _runtime
     * @param {import("./agentToolInputs.d.ts").GetIntentActionTypeDocsToolInput} input
     */
    getIntentActionTypeDocs(_runtime, input) {
        try {
            return {
                text:
                    "Read docs for intent type " +
                    input.typeName +
                    ". No action was executed.",
                content: getIntentActionTypeDocsContent(input),
            };
        } catch (error) {
            throw new ToolCallRejectionError(
                error instanceof Error ? error.message : String(error)
            );
        }
    },

    /**
     * @param {AgentToolRuntime} runtime
     * @param {import("./agentToolInputs.d.ts").ZoomToScaleToolInput} input
     */
    async zoomToScale(runtime, input) {
        const resolution = runtime.agentApi
            .getNamedScaleResolutions()
            .get(input.scaleName);

        if (!resolution) {
            throw new ToolCallRejectionError(
                'Unknown scale name "' + input.scaleName + '".'
            );
        } else if (!resolution.isZoomable()) {
            throw new ToolCallRejectionError(
                'Scale "' + input.scaleName + '" is not zoomable.'
            );
        }

        try {
            await resolution.zoomTo(input.domain, true);
        } catch (error) {
            throw new ToolCallRejectionError(
                error instanceof Error ? error.message : String(error)
            );
        }

        return {
            text: 'Zoomed scale "' + input.scaleName + '".',
            content: {
                kind: "scale_zoom",
                scaleName: input.scaleName,
                domain: input.domain,
            },
        };
    },

    /**
     * @param {AgentToolRuntime} runtime
     * @param {import("./agentToolInputs.d.ts").SubmitIntentActionToolInput} input
     */
    async submitIntentAction(runtime, input) {
        try {
            const steps =
                /** @type {import("./types.d.ts").AgentIntentBatchStep[]} */ (
                    normalizeAgentIntentActionAttributes(runtime, [
                        input.action,
                    ])
                );
            const agentNotes = getSubmitIntentActionNotes(
                runtime.getAgentVolatileContext(),
                input.action
            );
            const result = await runtime.submitIntentActions(
                {
                    schemaVersion: 1,
                    steps,
                    rationale: input.note,
                },
                {
                    submissionKind: "agent",
                }
            );
            return {
                text: runtime.summarizeExecutionResult(result),
                content:
                    agentNotes.length > 0
                        ? { ...result.content, agentNotes }
                        : result.content,
                summaries: result.summaries,
            };
        } catch (error) {
            // Surface intent execution failures back to the model as a rejected tool call.
            if (error instanceof ToolCallRejectionError) {
                throw error;
            }

            throw new ToolCallRejectionError(
                error instanceof Error ? error.message : String(error)
            );
        }
    },
};

/**
 * @param {import("./types.d.ts").AgentVolatileContext} volatileContext
 * @param {import("./types.d.ts").AgentIntentBatchStep} action
 * @returns {import("./types.d.ts").IntentBatchExecutionNote[]}
 */
function getSubmitIntentActionNotes(volatileContext, action) {
    const attribute =
        action.actionType === "sampleView/deriveMetadata"
            ? /** @type {unknown} */ (action.payload.attribute)
            : undefined;

    if (
        action.actionType === "sampleView/deriveMetadata" &&
        isSelectionAggregationAttribute(attribute)
    ) {
        const candidate = volatileContext.selectionAggregation.fields.find(
            (field) => field.candidateId === attribute.candidateId
        );
        const selector = candidate?.selectionSelector;
        if (!selector) {
            return [];
        }

        return [
            {
                selector: structuredClone(selector),
                message:
                    "This derived metadata was based on the current interval selection. If that selection was only needed to derive this metadata, clear it before subsequent actions that should not depend on it.",
            },
        ];
    }

    return [];
}

/**
 * @param {unknown} attribute
 * @returns {attribute is import("./agentToolInputs.d.ts").SelectionAggregationCandidate}
 */
function isSelectionAggregationAttribute(attribute) {
    return (
        !!attribute &&
        typeof attribute === "object" &&
        !Array.isArray(attribute) &&
        /** @type {{ type?: unknown }} */ (attribute).type ===
            "SELECTION_AGGREGATION"
    );
}

/**
 * @param {AgentToolRuntime} runtime
 * @param {number} undoneActionCount
 * @returns {AgentToolExecutionResult}
 */
function activateInitialProvenanceState(runtime, undoneActionCount) {
    const changed = runtime.agentApi.jumpToInitialProvenanceState();

    return {
        text: changed
            ? "Jumped to the initial provenance state."
            : "The initial provenance state was already active. This did not undo or change the analysis. Continue from the active state or choose a different provenance state.",
        content: createProvenanceStateActivation(
            undefined,
            undefined,
            true,
            changed,
            undoneActionCount
        ),
    };
}

/**
 * @param {import("./types.d.ts").AgentActionPayloadField[]} payloadFields
 * @returns {string[]}
 */
function getReferencedPayloadFieldTypes(payloadFields) {
    return Array.from(
        new Set(payloadFields.flatMap((field) => field.typeRefs))
    );
}

/**
 * @param {import("./types.d.ts").AgentActionPayloadField} field
 * @returns {import("./types.d.ts").AgentPayloadField}
 */
function projectPayloadFieldDoc(field) {
    return {
        name: field.name,
        type: field.type,
        description: field.description,
        required: field.required,
    };
}

/**
 * @param {AgentToolRuntime} runtime
 * @param {{
 *     plotRequest: import("@genome-spy/app/agentApi").SampleAttributePlotRequest;
 *     attributeRecord?: unknown;
 *     attributeRecords?: unknown[];
 * }} options
 * @returns {Promise<AgentToolExecutionResult>}
 */
async function executeSampleAttributePlot(runtime, options) {
    try {
        const plot = await runtime.agentApi.buildSampleAttributePlot(
            removeUndefinedProperties(options.plotRequest)
        );
        if (!plot) {
            throw new Error(
                "The requested sample attribute plot could not be built."
            );
        }

        return {
            text:
                `Shown ${plot.title} with ${plot.summary.groupCount} groups ` +
                `and ${plot.summary.plottedCount} plotted samples or points ` +
                "in the chat transcript.",
            content: {
                ...plot,
                ...(options.attributeRecord
                    ? {
                          attribute: createPlotAttributeResultRecord(
                              options.attributeRecord
                          ),
                      }
                    : {}),
                ...(options.attributeRecords
                    ? {
                          attributes: options.attributeRecords.map(
                              createPlotAttributeResultRecord
                          ),
                      }
                    : {}),
            },
        };
    } catch (error) {
        throw new ToolCallRejectionError(formatAgentToolErrorMessage(error));
    }
}

/**
 * @param {unknown} record
 * @returns {unknown}
 */
function createPlotAttributeResultRecord(record) {
    if (!record || typeof record !== "object") {
        return record;
    }

    const resultRecord = {
        .../** @type {Record<string, unknown>} */ (record),
    };
    if ("plotAttribute" in resultRecord) {
        resultRecord.normalized = resultRecord.plotAttribute;
    }
    delete resultRecord.plotAttribute;
    return resultRecord;
}

/**
 * @param {import("@genome-spy/app/agentShared").AttributeIdentifier} a
 * @param {import("@genome-spy/app/agentShared").AttributeIdentifier} b
 * @returns {boolean}
 */
function isSameAttributeIdentifier(a, b) {
    return (
        a.type === b.type &&
        JSON.stringify(a.specifier) === JSON.stringify(b.specifier)
    );
}

/**
 * @template {Record<string, any>} T
 * @param {T} object
 * @returns {T}
 */
function removeUndefinedProperties(object) {
    return /** @type {T} */ (
        Object.fromEntries(
            Object.entries(object).filter((entry) => entry[1] !== undefined)
        )
    );
}

/**
 * @param {AgentToolRuntime} runtime
 * @param {import("@genome-spy/core/view/viewSelectors.js").ViewSelector} selector
 */
function ensureResolvedView(runtime, selector) {
    const view = runtime.agentApi.resolveViewSelector(selector);
    if (!view) {
        throw new ToolCallRejectionError(
            "Selector did not resolve in the current view hierarchy."
        );
    }
    return view;
}

/**
 * @param {AgentToolRuntime} runtime
 * @param {import("@genome-spy/core/view/viewSelectors.js").ViewSelector} selector
 * @param {boolean} expanded
 * @returns {AgentToolExecutionResult}
 */
function updateViewNodeExpansion(runtime, selector, expanded) {
    ensureResolvedView(runtime, selector);
    const changed = expanded
        ? runtime.expandViewNode(selector)
        : runtime.collapseViewNode(selector);
    const before = expanded ? !changed : changed;
    const text = expanded
        ? changed
            ? "Expanded the requested view branch."
            : "The requested view branch was already expanded."
        : changed
          ? "Collapsed the requested view branch."
          : "The requested view branch was already collapsed.";

    return {
        text,
        content: createViewStateChange(
            "agent_context",
            "collapsed",
            selector,
            before,
            expanded
        ),
    };
}

/**
 * @param {import("./types.d.ts").AgentViewStateChange["domain"]} domain
 * @param {import("./types.d.ts").AgentViewStateChange["field"]} field
 * @param {import("@genome-spy/core/view/viewSelectors.js").ViewSelector} selector
 * @param {boolean} before
 * @param {boolean} after
 * @returns {import("./types.d.ts").AgentViewStateChange}
 */
function createViewStateChange(domain, field, selector, before, after) {
    return {
        kind: "view_state_change",
        domain,
        field,
        selector,
        before,
        after,
        changed: before !== after,
    };
}

/**
 * @param {string | undefined} provenanceId
 * @param {(import("@genome-spy/app/agentShared").ProvenanceAction & { summary?: string }) | undefined} action
 * @param {boolean} initial
 * @param {boolean} changed
 * @param {number} undoneActionCount
 * @returns {{
 *     kind: "provenance_state_activation";
 *     provenanceId?: string;
 *     actionType?: string;
 *     summary?: string;
 *     initial: boolean;
 *     changed: boolean;
 *     undoneActionCount: number;
 * }}
 */
function createProvenanceStateActivation(
    provenanceId,
    action,
    initial,
    changed,
    undoneActionCount
) {
    return {
        kind: "provenance_state_activation",
        ...(provenanceId ? { provenanceId } : {}),
        ...(action
            ? {
                  actionType: action.type,
                  summary: action.summary ?? action.type,
              }
            : {}),
        initial,
        changed,
        undoneActionCount,
    };
}

/**
 * @param {import("@genome-spy/app/agentShared").ProvenanceAction[]} actionHistory
 * @param {string} provenanceId
 * @returns {number}
 */
function findProvenanceActionIndex(actionHistory, provenanceId) {
    const index = actionHistory.findIndex(
        (entry) => entry.provenanceId === provenanceId
    );
    if (index < 0) {
        throw new ToolCallRejectionError(
            "Unknown provenance id " + provenanceId + "."
        );
    }

    return index;
}
