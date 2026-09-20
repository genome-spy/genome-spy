import UnitView from "./unitView.js";
import { isDataReady } from "../data/dataReadiness.js";
import { buildReadinessRequest } from "./dataReadiness.js";

/**
 * Detached metadata with authored and inherited encoding, not runtime mark adjustments.
 * @param {import("./view.js").default} view
 * @returns {import("../types/embedApi.js").ViewDescription}
 */
export function describeView(view) {
    const collector =
        view instanceof UnitView ? view.getCollector() : undefined;
    return {
        title: structuredClone(view.getTitleText() ?? null),
        description: structuredClone(view.spec.description ?? null),
        encoding: structuredClone(view.getEncoding()),
        dataReady: Boolean(
            collector &&
            isDataReady(collector, buildReadinessRequest(view, ["x", "y"]))
        ),
    };
}

/**
 * Reads at most limit + 1 rows; the extra row establishes truncation.
 * This does not filter by viewport or claim complete source coverage.
 * @param {import("./view.js").default} view
 * @param {import("../types/embedApi.js").ViewDataReadOptions} options
 * @returns {import("../types/embedApi.js").ViewDataReadResult}
 */
export function readViewData(view, { limit }) {
    if (!Number.isInteger(limit) || limit < 0 || limit > 1000) {
        throw new Error("Data read limit must be an integer from 0 to 1000.");
    }
    if (!(view instanceof UnitView)) {
        throw new Error("Data reads require a unit view.");
    }
    const collector = view.getCollector();
    if (
        !collector ||
        !isDataReady(collector, buildReadinessRequest(view, ["x", "y"]))
    ) {
        throw new Error("View data is not ready.");
    }
    if (collector.facetBatches.size > 1) {
        throw new Error("Faceted data reads are not supported.");
    }
    const rows = [];
    let rowsExamined = 0;
    let truncated = false;
    for (const row of collector.getData()) {
        rowsExamined++;
        if (rows.length === limit) {
            truncated = true;
            break;
        }
        rows.push(structuredClone(row));
    }
    return {
        rows,
        rowsExamined,
        truncated,
        scope: "loaded-transformed",
        ready: true,
    };
}
