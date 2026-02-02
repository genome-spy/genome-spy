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

    const showRunningDialog = () => {
        if (runningDialog) {
            return;
        }
        const { element, promise } = showIntentStatusDialog({
            title: "Working…",
            message: "Processing actions. Cancel if it takes too long.",
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
        const actionInfo = failedAction
            ? provenance.getActionInfo(failedAction)
            : undefined;
        const actionTitle =
            actionInfo?.provenanceTitle ??
            actionInfo?.title ??
            failedAction?.type ??
            "action";
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
