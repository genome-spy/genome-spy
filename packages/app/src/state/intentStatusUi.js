import { html } from "lit";
import { subscribeTo } from "./subscribeTo.js";
import { intentStatusSlice } from "./intentStatusSlice.js";
import { showIntentStatusDialog } from "../components/dialogs/intentStatusDialog.js";
import { showIntentErrorDialog } from "../components/dialogs/intentErrorDialog.js";

/**
 * @typedef {object} IntentStatusUiOptions
 * @prop {import("@reduxjs/toolkit").Store} store
 * @prop {import("./intentPipeline.js").default} intentPipeline
 * @prop {import("./provenance.js").default} provenance
 * @prop {number} [delayMs]
 */

/**
 * @typedef {object} IntentStatusSnapshot
 * @prop {number} [currentIndex]
 * @prop {number} [totalActions]
 * @prop {import("@reduxjs/toolkit").Action} [currentAction]
 */

/**
 * Wires intent status changes to user-facing dialogs.
 *
 * @param {IntentStatusUiOptions} options
 * @returns {() => void}
 */
export function attachIntentStatusUi({
    store,
    intentPipeline,
    provenance,
    delayMs = 500,
}) {
    let runningTimer =
        /** @type {ReturnType<typeof setTimeout> | undefined} */ (undefined);
    let runningDialog =
        /** @type {import("../components/dialogs/intentStatusDialog.js").default | undefined} */ (
            undefined
        );

    const closeRunningDialog = () => {
        if (!runningDialog) {
            return;
        }
        runningDialog.closeDialog();
        runningDialog = undefined;
    };

    /**
     * @param {IntentStatusSnapshot | undefined} status
     * @returns {string}
     */
    const buildRunningMessage = (status) => {
        const actionTitle = status?.currentAction
            ? getActionTitleText(provenance, status.currentAction)
            : undefined;
        const progressText =
            typeof status?.currentIndex === "number" &&
            typeof status?.totalActions === "number"
                ? "(" +
                  String(status.currentIndex + 1) +
                  " of " +
                  String(status.totalActions) +
                  ")"
                : undefined;
        const actionLine = actionTitle
            ? "Performing: " + actionTitle
            : "Processing actions.";
        return (
            actionLine +
            (progressText ? " " + progressText : "") +
            ". Cancel if it takes too long."
        );
    };

    const showRunningDialog = () => {
        if (runningDialog) {
            return;
        }
        const status = store.getState().intentStatus;
        const { element, promise } = showIntentStatusDialog({
            title: "Working…",
            message: buildRunningMessage(status),
            cancelLabel: "Cancel",
        });
        runningDialog = element;
        promise.then((detail) => {
            if (detail.ok) {
                intentPipeline.abortCurrent();
            }
        });
    };

    /**
     * @param {import("@reduxjs/toolkit").Action | undefined} failedAction
     * @param {string | undefined} errorMessage
     */
    const showErrorDialog = async (failedAction, errorMessage) => {
        const actionTitle = failedAction
            ? getActionTitle(provenance, failedAction)
            : "action";
        const isAbort = isAbortMessage(errorMessage);
        const message = html`<div>
            <div>
                ${isAbort ? "Canceled while performing:" : "Failed to perform:"}
                ${actionTitle}
            </div>
            ${errorMessage ? html`<div>Details: ${errorMessage}</div>` : ""}
            <div>The failed action was rolled back.</div>
            <div>Roll back the entire batch, or keep the current state?</div>
        </div>`;
        const decision = await showIntentErrorDialog({
            title: isAbort ? "Action canceled" : "Action interrupted",
            message,
            rollbackLabel: "Rollback entire batch",
            keepLabel: "Keep current state",
        });

        store.dispatch(
            intentStatusSlice.actions.resolveError({
                decision,
            })
        );
    };

    const unsubscribe = subscribeTo(
        store,
        (state) => state.intentStatus,
        (next, prev) => {
            if (next?.status === "running") {
                if (!runningTimer) {
                    runningTimer = setTimeout(() => {
                        runningTimer = undefined;
                        const status = store.getState().intentStatus?.status;
                        if (status === "running") {
                            showRunningDialog();
                        }
                    }, delayMs);
                }
                if (runningDialog) {
                    runningDialog.message = buildRunningMessage(next);
                }
                return;
            }

            if (runningTimer) {
                clearTimeout(runningTimer);
                runningTimer = undefined;
            }

            closeRunningDialog();

            if (next?.status === "error" && prev?.status !== "error") {
                void showErrorDialog(next.failedAction, next.error);
            }
        }
    );

    return () => {
        if (runningTimer) {
            clearTimeout(runningTimer);
            runningTimer = undefined;
        }
        closeRunningDialog();
        unsubscribe();
    };
}

/**
 * @param {string | undefined} errorMessage
 * @returns {boolean}
 */
function isAbortMessage(errorMessage) {
    return (
        typeof errorMessage === "string" && /abort|cancel/i.test(errorMessage)
    );
}

/**
 * @param {import("./provenance.js").default} provenance
 * @param {import("@reduxjs/toolkit").Action} action
 * @returns {string | import("lit").TemplateResult}
 */
function getActionTitle(provenance, action) {
    const actionInfo = provenance.getActionInfo(action);
    return (
        actionInfo?.provenanceTitle ??
        actionInfo?.title ??
        action.type ??
        "action"
    );
}

/**
 * @param {import("./provenance.js").default} provenance
 * @param {import("@reduxjs/toolkit").Action} action
 * @returns {string}
 */
function getActionTitleText(provenance, action) {
    const title = getActionTitle(provenance, action);
    if (typeof title === "string") {
        return title;
    }
    if (title && Array.isArray(title.strings)) {
        return title.strings.join("").trim();
    }
    return action.type ?? "action";
}
