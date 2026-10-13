import { isDataReady, iterateDataDependencies } from "../data/dataReadiness.js";
import FilterTransform from "../data/transforms/filter.js";
import { iterateParamDependencies } from "../paramRuntime/paramRuntime.js";
import { analyzeExpression } from "../utils/expression.js";
import { isRegionSelection } from "./selection.js";

/**
 * Detects self-filtered consumers through the actual scoped reactive dependencies.
 * @param {import("../view/unitView.js").default} view
 * @param {import("../paramRuntime/types.js").ParamRef<any>} selectionRef
 */
export function isRegionSelectionFiltered(view, selectionRef) {
    return iterateRegionFilterDependencies(view).some(
        (ref) => ref === selectionRef
    );
}

/**
 * Empty filtered output is provisional while an upstream lasso is pending.
 * @param {import("../view/unitView.js").default} view
 */
export function isRegionProducerReady(view) {
    return (
        isDataReady(view.getCollector()) &&
        !iterateRegionFilterDependencies(view).some((ref) => {
            const value = ref.get();
            return (
                value && isRegionSelection(value) && value.status === "pending"
            );
        })
    );
}

/** @param {import("../view/unitView.js").default} view */
function* iterateRegionFilterDependencies(view) {
    for (const node of iterateDataDependencies(view.getCollector())) {
        if (node instanceof FilterTransform) {
            const names =
                "param" in node.params
                    ? [node.params.param]
                    : analyzeExpression(node.params.expr).globals;
            const refs = names
                .map((name) =>
                    node.paramRuntimeProvider.paramRuntime.getParamRef(name)
                )
                .filter((ref) => ref !== undefined);
            yield* iterateParamDependencies(refs);
        }
    }
}
