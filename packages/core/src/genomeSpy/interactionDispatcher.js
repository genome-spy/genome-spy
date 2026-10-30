import Interaction from "../utils/interaction.js";
import { shallowArrayEquals } from "../utils/arrayUtils.js";

/**
 * Layout rebuilds may replace tuple arrays without changing the category.
 * @param {import("../spec/channel.js").Scalar[] | undefined} a
 * @param {import("../spec/channel.js").Scalar[] | undefined} b
 */
function sameFacet(a, b) {
    return (
        a === b ||
        (a !== undefined && b !== undefined && shallowArrayEquals(a, b))
    );
}

/**
 * Dispatches `Interaction` objects through the view hierarchy and synthesizes
 * subtree-level pointer transition events.
 *
 * The dispatcher keeps track of the previously pointed views and compares
 * them with the views reached on every `mousemove`. From that diff it
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
 * the incoming interaction, record themselves in `interaction.pointedViews`,
 * and set the deepest `interaction.target` during propagation. Tracking all
 * routed views is necessary for layers, where multiple parallel branches are
 * pointed simultaneously even though `target` can identify only one of them.
 */
export default class InteractionDispatcher {
    /** @type {import("../view/view.js").default} */
    #viewRoot;
    /** @type {import("../view/layout/point.js").default | undefined} */
    #lastPoint;
    /** @type {import("../view/view.js").default | undefined} */
    #lastTarget;
    /** @type {Interaction["pointedViews"]} */
    #previousViews = new Map();

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
     * @param {import("../types/interactionApi.js").InternalMarkHit | null} [markHit]
     * @returns {Interaction}
     */
    dispatch(point, uiEvent, markHit) {
        this.#lastPoint = point;
        const interaction = new Interaction(point, uiEvent);
        interaction.markHit = markHit;
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
        if (!this.#lastPoint || this.#previousViews.size === 0) {
            this.#previousViews.clear();
            this.#lastTarget = undefined;
            return;
        }

        const interaction = new Interaction(
            this.#lastPoint,
            uiEvent,
            "mouseleave"
        );
        this.#dispatchTransitionEvents(
            interaction,
            Array.from(this.#previousViews.keys()),
            "mouseleave",
            undefined,
            this.#previousViews
        );
        this.#previousViews.clear();
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
        const currentViewSet = interaction.pointedViews;
        if (currentViewSet.size === 0) {
            for (const view of this.#toRootPath(interaction.target)) {
                currentViewSet.set(view, undefined);
            }
        }
        const currentViews = Array.from(currentViewSet.keys());
        const previousViews = Array.from(this.#previousViews.keys());
        const leavingViews = previousViews.filter(
            (view) =>
                !currentViewSet.has(view) ||
                !sameFacet(
                    currentViewSet.get(view),
                    this.#previousViews.get(view)
                )
        );
        const enteringViews = currentViews.filter(
            (view) =>
                !this.#previousViews.has(view) ||
                !sameFacet(
                    currentViewSet.get(view),
                    this.#previousViews.get(view)
                )
        );

        if (leavingViews.length > 0) {
            this.#dispatchTransitionEvents(
                interaction,
                leavingViews,
                "mouseleave",
                currentViews.at(-1),
                this.#previousViews
            );
        }

        if (enteringViews.length > 0) {
            this.#dispatchTransitionEvents(
                interaction,
                enteringViews,
                "mouseenter",
                previousViews.at(-1),
                currentViewSet
            );
        }

        this.#previousViews = currentViewSet;
    }

    /**
     * @param {Interaction} baseInteraction
     * @param {import("../view/view.js").default[]} views
     * @param {"mouseenter" | "mouseleave"} type
     * @param {import("../view/view.js").default | undefined} relatedTarget
     * @param {Interaction["pointedViews"]} facets
     */
    #dispatchTransitionEvents(
        baseInteraction,
        views,
        type,
        relatedTarget,
        facets
    ) {
        // Enter from the root inward; leave from the deepest view outward.
        for (let i = 0; i < views.length; i++) {
            const view =
                views[type === "mouseleave" ? views.length - 1 - i : i];
            const interaction = new Interaction(
                baseInteraction.point,
                baseInteraction.uiEvent,
                type
            );
            interaction.target = view;
            interaction.currentTarget = view;
            interaction.relatedTarget = relatedTarget;
            interaction.facetId = facets.get(view);
            interaction.pointedViews = baseInteraction.pointedViews;
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
