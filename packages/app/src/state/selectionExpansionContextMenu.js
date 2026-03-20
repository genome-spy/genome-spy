import SampleView from "../sampleView/sampleView.js";
import { contextMenu } from "../utils/ui/contextMenu.js";
import {
    MULTIPLE_POINT_SELECTION_PARAMS_REASON,
    resolveSelectionExpansionContext,
} from "./selectionExpansionContext.js";
import { createSelectionExpansionMenuItem } from "./selectionExpansionMenu.js";

/**
 * @typedef {import("@genome-spy/core/view/view.js").default} View
 * @typedef {import("./intentExecutor.js").default<any>} IntentExecutor
 */

/**
 * @param {object} options
 * @param {View} options.viewRoot
 * @param {IntentExecutor} options.intentExecutor
 * @returns {() => void}
 */
export function setupSelectionExpansionContextMenu({
    viewRoot,
    intentExecutor,
}) {
    let selectionExpansionMultiParamWarningShown = false;

    const listener = (
        /** @type {import("@genome-spy/core/utils/interaction.js").default} */ event
    ) => {
        if (event.stopped || isInsideSampleView(event.target)) {
            return;
        }

        const resolution = resolveSelectionExpansionContext(
            viewRoot,
            viewRoot.context.getCurrentHover()
        );

        if (
            resolution.status === "disabled" &&
            resolution.reason === MULTIPLE_POINT_SELECTION_PARAMS_REASON
        ) {
            if (!selectionExpansionMultiParamWarningShown) {
                console.warn(
                    "Selection expansion is disabled because multiple multi-point selection parameters are configured in the same UnitView."
                );
                selectionExpansionMultiParamWarningShown = true;
            }
            return;
        }

        if (resolution.status !== "available") {
            return;
        }

        contextMenu(
            {
                items: [
                    createSelectionExpansionMenuItem(
                        resolution.context,
                        (action) => intentExecutor.dispatch(action)
                    ),
                ],
            },
            event.mouseEvent
        );
        event.stopPropagation();
    };

    viewRoot.addInteractionListener("contextmenu", listener);
    return () => viewRoot.removeInteractionListener("contextmenu", listener);
}

/**
 * @param {View | undefined} view
 * @returns {boolean}
 */
function isInsideSampleView(view) {
    if (!view) {
        return false;
    }

    return view
        .getLayoutAncestors()
        .some((ancestor) => ancestor instanceof SampleView);
}
