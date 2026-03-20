/**
 * Runs the shared capture/body/bubble interaction frame for a container view.
 *
 * @param {import("./view.js").default} view
 * @param {import("../utils/interaction.js").default} event
 * @param {() => void} handler
 */
export function propagateInteraction(view, event, handler) {
    view.handleInteraction(event, true);

    if (event.stopped) {
        return;
    }

    handler();

    if (event.stopped) {
        return;
    }

    view.handleInteraction(event, false);
}

/**
 * Propagates an interaction to a single hit-tested surface and optionally runs
 * a follow-up action such as zoom handling.
 *
 * @param {import("../utils/interaction.js").default} event
 * @param {() => boolean} hitTest
 * @param {() => void} propagate
 * @param {() => void} [afterPropagate]
 * @returns {boolean}
 */
export function propagateInteractionSurface(
    event,
    hitTest,
    propagate,
    afterPropagate
) {
    if (!hitTest()) {
        return false;
    }

    propagate();

    if (event.stopped) {
        return true;
    }

    afterPropagate?.();

    return true;
}
