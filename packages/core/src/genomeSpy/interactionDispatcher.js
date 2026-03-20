import Interaction from "../utils/interaction.js";
import InteractionEvent from "../utils/interactionEvent.js";

/**
 * Bridges the new internal Interaction model to the legacy InteractionEvent
 * listener/propegation API that the current view hierarchy still consumes.
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
     * @param {import("../view/layout/point.js").default} point
     * @param {import("../utils/interactionEvent.js").InteractionUiEvent} uiEvent
     * @returns {Interaction}
     */
    dispatch(point, uiEvent) {
        this.#lastPoint = point;
        const interaction = new Interaction(point, uiEvent);
        const legacyEvent = new InteractionEvent(interaction);
        this.#viewRoot.propagateInteractionEvent(legacyEvent);
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
     * @param {import("../view/view.js").default} view
     * @param {Interaction} interaction
     */
    #dispatchDirect(view, interaction) {
        const legacyEvent = new InteractionEvent(interaction);
        view.handleInteractionEvent(undefined, legacyEvent, true);

        if (legacyEvent.stopped) {
            return;
        }

        view.handleInteractionEvent(undefined, legacyEvent, false);
    }
}
