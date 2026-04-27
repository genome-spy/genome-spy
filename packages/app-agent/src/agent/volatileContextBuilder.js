import { getSelectionAggregationContext } from "./selectionAggregationContext.js";
import { isVariableParameter } from "@genome-spy/core/paramRuntime/paramUtils.js";
import {
    getParamSelector,
    isChromeView,
    visitNonChromeViews,
} from "@genome-spy/core/view/viewSelectors.js";
import {
    isBaselineAction,
    serializeBookmarkableParamValue,
    templateResultToString,
} from "@genome-spy/app/agentShared";
import { VISIT_SKIP } from "@genome-spy/core/view/view.js";

/**
 * @param {import("@genome-spy/app/agentApi").AgentApi} agentApi
 * @returns {import("./types.d.ts").AgentVolatileContext}
 */
export function getAgentVolatileContext(agentApi) {
    const sampleHierarchy = agentApi.getSampleHierarchy();
    const provenance = agentApi.getActionHistory() ?? [];

    return {
        sampleSummary: buildSampleSummary(sampleHierarchy),
        sampleGroupLevels: sampleHierarchy
            ? buildSampleGroupLevels(agentApi, sampleHierarchy)
            : [],
        parameterValues: buildParameterValues(agentApi),
        selectionAggregation: getSelectionAggregationContext(agentApi),
        provenance: buildProvenanceActions(agentApi, provenance),
    };
}

/**
 * @param {import("@genome-spy/app/agentApi").AgentApi} agentApi
 * @returns {import("./types.js").AgentParameterValueSummary[]}
 */
function buildParameterValues(agentApi) {
    const rootView = agentApi.getViewRoot();
    if (!rootView) {
        return [];
    }

    /** @type {import("./types.js").AgentParameterValueSummary[]} */
    const values = [];

    visitNonChromeViews(rootView, (view) => {
        if (isChromeView(view)) {
            return VISIT_SKIP;
        }

        if (!view?.paramRuntime?.paramConfigs) {
            return;
        }

        for (const [paramName, param] of view.paramRuntime.paramConfigs) {
            const value = getAgentVisibleParameterValue(view, paramName, param);
            if (!value) {
                continue;
            }

            let selector;
            try {
                selector = getParamSelector(view, paramName);
            } catch {
                continue;
            }

            values.push({
                selector,
                value: value.value,
            });
        }
    });

    return values.sort((a, b) =>
        JSON.stringify(a.selector).localeCompare(JSON.stringify(b.selector))
    );
}

/**
 * @param {any} view
 * @param {string} paramName
 * @param {any} param
 * @returns {{ value: unknown } | undefined}
 */
function getAgentVisibleParameterValue(view, paramName, param) {
    if ("select" in param) {
        return {
            value: serializeBookmarkableParamValue(
                view,
                view.paramRuntime.getValue(paramName)
            ),
        };
    }

    if (
        !isVariableParameter(param) ||
        !param.bind ||
        !("input" in param.bind)
    ) {
        return;
    }

    return {
        value: view.paramRuntime.getValue(paramName),
    };
}

/**
 * @param {import("@genome-spy/app/agentShared").SampleHierarchy | undefined} sampleHierarchy
 * @returns {import("./types.js").AgentSampleSummary}
 */
function buildSampleSummary(sampleHierarchy) {
    if (!sampleHierarchy) {
        return {
            totalSampleCount: 0,
            groupCount: 0,
            visibleSampleCount: 0,
        };
    }

    return {
        totalSampleCount: sampleHierarchy.sampleData.ids.length,
        groupCount: sampleHierarchy.groupMetadata.length,
        visibleSampleCount: countVisibleSamples(sampleHierarchy.rootGroup),
    };
}

/**
 * @param {import("@genome-spy/app/agentApi").AgentApi} agentApi
 * @param {import("@genome-spy/app/agentShared").SampleHierarchy} sampleHierarchy
 * @returns {import("./types.js").AgentSampleGroupLevel[]}
 */
function buildSampleGroupLevels(agentApi, sampleHierarchy) {
    return sampleHierarchy.groupMetadata.map((entry, level) => {
        const info = agentApi.getAttributeInfo(entry.attribute);

        return {
            level,
            attribute: entry.attribute,
            title: templateResultToString(info.title),
        };
    });
}

/**
 * @param {any} group
 * @param {Set<string>} [sampleIds]
 * @returns {number}
 */
function countVisibleSamples(group, sampleIds = new Set()) {
    if (!group) {
        return 0;
    }

    if ("samples" in group) {
        for (const sampleId of group.samples) {
            sampleIds.add(sampleId);
        }

        return sampleIds.size;
    }

    for (const child of group.groups) {
        countVisibleSamples(child, sampleIds);
    }

    return sampleIds.size;
}

/**
 * @param {import("@genome-spy/app/agentApi").AgentApi} agentApi
 * @param {import("@reduxjs/toolkit").Action[]} provenanceActions
 * @returns {import("./agentContextTypes.d.ts").AgentProvenanceAction[]}
 */
function buildProvenanceActions(agentApi, provenanceActions) {
    return provenanceActions
        .filter((action) => !isBaselineAction(action))
        .slice(-10)
        .map((action) => {
            const info = agentApi.getActionInfo(
                /** @type {import("./agentContextTypes.d.ts").AgentProvenanceAction} */ (
                    action
                )
            );
            const title =
                info?.provenanceTitle ??
                info?.title ??
                action.type.replace("sampleView/", "");

            return {
                summary: templateResultToString(title),
                provenanceId: /** @type {any} */ (action).provenanceId,
                type: action.type,
                payload: /** @type {any} */ (action).payload,
                meta: /** @type {any} */ (action).meta,
                error: /** @type {any} */ (action).error,
            };
        });
}
