import Interaction from "../utils/interaction.js";

/**
 * Dispatches `Interaction` objects through the view hierarchy and synthesizes
 * subtree-level pointer transition events.
 *
 * The dispatcher keeps track of the previously hovered target path and
 * compares it with the current one on every `mousemove`. From that diff it
 * emits:
 * - `mouseleave` for views that are no longer in the pointed subtree
 * - `mouseenter` for views that have newly entered the pointed subtree
 *
 * This is intentionally closer to `mouseenter` / `mouseleave` semantics than
 * DOM `mouseover` / `mouseout`. Moving between descendants inside the same
 * subtree does not cause the ancestor to leave and re-enter.
 *
 * `dispatch()` handles ordinary event propagation and updates the current
 * pointed target. `handlePointerLeave()` is used when the pointer leaves the
 * canvas entirely, in which case the dispatcher emits `mouseleave` for the
 * whole previously hovered path and clears its tracked state.
 *
 * The dispatcher does not do hit testing itself. It relies on views to route
 * the incoming interaction and set `interaction.target` during propagation.
 */
export default class InteractionDispatcher {
    /** @type {import("../view/view.js").default} */
    #viewRoot;
    /** @type {import("../view/layout/point.js").default | undefined} */
    #lastPoint;
    /** @type {import("../view/view.js").default | undefined} */
    #lastTarget;
    /** @type {import("../view/view.js").default[]} */
    #previousPath = [];

    /**
     * @param {object} options
     * @param {import("../view/view.js").default} options.viewRoot
     */
    constructor({ viewRoot }) {
        this.#viewRoot = viewRoot;
    }

    /**
     * Dispatches an interaction through the view tree and updates the tracked
     * hover path for transition synthesis.
     *
     * @param {import("../view/layout/point.js").default} point
     * @param {import("../utils/interactionEvent.js").InteractionUiEvent} uiEvent
     * @returns {Interaction}
     */
    dispatch(point, uiEvent) {
        this.#lastPoint = point;
        const interaction = new Interaction(point, uiEvent);
        this.#viewRoot.propagateInteraction(interaction);
        this.#lastTarget = interaction.target;

        if (interaction.type === "mousemove") {
            this.#dispatchPointerTransitions(interaction);
        }

        return interaction;
    }

    /**
     * Dispatches mouseleave transitions when the pointer leaves the canvas.
     *
     * @param {import("../utils/interactionEvent.js").InteractionUiEvent} uiEvent
     */
    handlePointerLeave(uiEvent) {
        if (!this.#lastPoint || this.#previousPath.length === 0) {
            this.#previousPath = [];
            this.#lastTarget = undefined;
            return;
        }

        const interaction = new Interaction(
            this.#lastPoint,
            uiEvent,
            "mouseleave"
        );
        this.#dispatchLeaveEvents(interaction, this.#previousPath, undefined);
        this.#previousPath = [];
        this.#lastTarget = undefined;
    }

    getCurrentTarget() {
        return this.#lastTarget;
    }

    /**
     * Diffs the old and new pointed paths and emits synthetic subtree
     * transitions.
     *
     * @param {Interaction} interaction
     */
    #dispatchPointerTransitions(interaction) {
        const currentPath = this.#toRootPath(interaction.target);
        const previousPath = this.#previousPath;

        let commonLength = 0;
        while (
            commonLength < previousPath.length &&
            commonLength < currentPath.length &&
            previousPath[commonLength] === currentPath[commonLength]
        ) {
            commonLength++;
        }

        if (commonLength < previousPath.length) {
            this.#dispatchLeaveEvents(
                interaction,
                previousPath.slice(commonLength),
                currentPath.at(-1)
            );
        }

        if (commonLength < currentPath.length) {
            this.#dispatchEnterEvents(
                interaction,
                currentPath.slice(commonLength),
                previousPath.at(-1)
            );
        }

        this.#previousPath = currentPath;
    }

    /**
     * @param {Interaction} baseInteraction
     * @param {import("../view/view.js").default[]} leavingViews
     * @param {import("../view/view.js").default | undefined} relatedTarget
     */
    #dispatchLeaveEvents(baseInteraction, leavingViews, relatedTarget) {
        for (let i = leavingViews.length - 1; i >= 0; i--) {
            const interaction = new Interaction(
                baseInteraction.point,
                baseInteraction.uiEvent,
                "mouseleave"
            );
            const view = leavingViews[i];
            interaction.target = view;
            interaction.currentTarget = view;
            interaction.relatedTarget = relatedTarget;
            this.#dispatchDirect(view, interaction);

            if (interaction.stopped) {
                return;
            }
        }
    }

    /**
     * @param {Interaction} baseInteraction
     * @param {import("../view/view.js").default[]} enteringViews
     * @param {import("../view/view.js").default | undefined} relatedTarget
     */
    #dispatchEnterEvents(baseInteraction, enteringViews, relatedTarget) {
        for (const view of enteringViews) {
            const interaction = new Interaction(
                baseInteraction.point,
                baseInteraction.uiEvent,
                "mouseenter"
            );
            interaction.target = view;
            interaction.currentTarget = view;
            interaction.relatedTarget = relatedTarget;
            this.#dispatchDirect(view, interaction);

            if (interaction.stopped) {
                return;
            }
        }
    }

    /**
     * @param {import("../view/view.js").default | undefined} target
     * @returns {import("../view/view.js").default[]}
     */
    #toRootPath(target) {
        return target ? target.getLayoutAncestors().reverse() : [];
    }

    /**
     * Dispatches a synthetic transition directly on a single view.
     *
     * Unlike ordinary routed propagation, enter/leave transitions are already
     * resolved to a specific view. Therefore the dispatcher invokes that
     * view's capture listeners first and bubble listeners second without
     * re-entering container routing.
     *
     * @param {import("../view/view.js").default} view
     * @param {Interaction} interaction
     */
    #dispatchDirect(view, interaction) {
        view.handleInteraction(interaction, true);

        if (interaction.stopped) {
            return;
        }

        view.handleInteraction(interaction, false);
    }
}
