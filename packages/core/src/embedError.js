import ViewError from "./view/viewError.js";
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
                console.error(error);
            }
            const message =
                error instanceof ViewError
                    ? `At "${error.view.getPathString()}": ${error}`
                    : String(error);
            const showError = () => {
                const style = createContainerStyle(container);
                const display = createMessageBox(container, message);
                errorDisplays.set(embedContainer, [style, display]);
            };

            try {
                if (!options.onError?.(error, container)) {
                    showError();
                }
            } catch (reportingError) {
                console.error(reportingError);
                showError();
            }

            throw error;
        },
    };
}
