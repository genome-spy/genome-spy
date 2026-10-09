import { formatErrorMessage, logError } from "./utils/errorPresentation.js";
import {
    createContainerStyle,
    createMessageBox,
} from "./genomeSpy/containerUi.js";

/** @type {WeakMap<HTMLElement, HTMLElement[]>} */
const errorDisplays = new WeakMap();

/**
 * Owns setup failures for an embed. Core reports launch failures before returning
 * false; defer the host callback until cleanup so it can render its own error UI.
 * After a successful launch, runtime errors use Core's normal reporting path.
 *
 * @param {HTMLElement} embedContainer
 * @param {import("./types/embedApi.js").EmbedOptions} options
 */
export function createEmbedErrorHandler(embedContainer, options) {
    errorDisplays.get(embedContainer)?.forEach((element) => element.remove());
    errorDisplays.delete(embedContainer);

    let launchPending = true;
    /** @type {unknown} */
    let launchError;

    return {
        /**
         * @param {unknown} error
         * @param {HTMLElement} container
         */
        onError(error, container) {
            if (launchPending) {
                launchError ??= error;
                return true;
            }
            return options.onError?.(error, container);
        },

        /** @param {boolean} succeeded */
        complete(succeeded) {
            if (!succeeded || launchError !== undefined) {
                throw launchError;
            }
            launchPending = false;
        },

        /**
         * @param {unknown} error
         * @param {HTMLElement} container
         * @param {Iterable<() => void>} disposers
         * @returns {never}
         */
        fail(error, container, disposers) {
            for (const dispose of disposers) {
                try {
                    dispose();
                } catch (cleanupError) {
                    console.error(cleanupError);
                }
            }

            if (error !== launchError) {
                logError(error);
            }
            const message = formatErrorMessage(error);
            let handled;
            try {
                handled = options.onError?.(error, container);
            } catch (reportingError) {
                console.error(reportingError);
            }
            if (!handled) {
                const style = createContainerStyle(container);
                const display = createMessageBox(container, message);
                errorDisplays.set(embedContainer, [style, display]);
            }

            throw error;
        },
    };
}
