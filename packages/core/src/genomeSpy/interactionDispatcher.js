import Interaction from "../utils/interaction.js";
import InteractionEvent from "../utils/interactionEvent.js";

/**
 * Bridges the new internal Interaction model to the legacy InteractionEvent
 * listener/propegation API that the current view hierarchy still consumes.
 */
export default class InteractionDispatcher {
    /** @type {import("../view/view.js").default} */
    #viewRoot;

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
        const interaction = new Interaction(point, uiEvent);
        const legacyEvent = new InteractionEvent(interaction);
        this.#viewRoot.propagateInteractionEvent(legacyEvent);
        return interaction;
    }
}
