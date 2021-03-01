/**
 * @typedef {object} Action
 * @prop {string} type
 * @prop {any} [payload]
 *
 * @typedef {object} ActionInfo
 * @prop {string | import("lit-html").TemplateResult} title A title shown in
 *      context menus or provenance tracking
 * @prop {string | import("lit-html").TemplateResult} [provenanceTitle] A title
 *      shown in the provenance tracking, if defined. Replaces the normal title.
 * @prop {string} [attributeName]
 * @prop {import("@fortawesome/free-solid-svg-icons").IconDefinition} [icon]
 */

/**
 * @typedef {object} ProvenanceNode
 * @prop {S} state The full state
 * @prop {Action} [action] The action that changed the previous state to this state
 * @template S State
 */

/**
 * Handles provenance, undo/redo, etc..
 *
 * This is somewhat inspired by:
 *     Z. T. Cutler, K. Gadhave and A. Lex,
 *     “Trrack: A Library for Provenance Tracking in Web-Based Visualizations”,
 *     osf.io preprint. https://doi.org/10.31219/osf.io/wnctb.
 * and
 *     S. Gratzl, A. Lex, N. Gehlenborg, N. Cosgrove, and M. Streit
 *     "From Visual Exploration to Storytelling and Back Again"
 *     Eurographics Conference on Visualization (EuroVis) 2016
 *     http://doi.wiley.com/10.1111/cgf.12925
 *
 * However, branching is not supported for now...
 *
 * We store both the actions and the full states. The states allow for
 * efficient navigation in the provenance data structure. Because
 * we use Immer, which uses structural sharing, the full states do not
 * consume too much memory.
 *
 * @template S State
 */
export default class Provenance {
    constructor() {
        /** @type {ProvenanceNode<S>[]} List of nodes. TODO: Replace with a tree */
        this.nodes = undefined;

        /** @type {number} */
        this.currentNodeIndex = undefined;

        /** @type {(function(S):void)[]} */
        this.listeners = [];

        /** @type {(function(Action):ActionInfo)[]} */
        this.actionInfoSources = [];
    }

    isInitialized() {
        return !!this.nodes;
    }

    /**
     *
     * @param {function(S):void} listener
     */
    addListener(listener) {
        this.listeners.push(listener);
    }

    /**
     *
     * @param {function(Action):ActionInfo} source
     */
    addActionInfoSource(source) {
        this.actionInfoSources.push(source);
    }

    /**
     * @param {Action} action
     * @returns {ActionInfo}
     */
    getActionInfo(action) {
        for (const source of this.actionInfoSources) {
            const info = source(action);
            if (info) {
                return info;
            }
        }
    }

    _notifyListeners() {
        for (const listener of this.listeners) {
            listener(this.state);
        }
    }

    /**
     *
     * @param {S} state
     */
    setInitialState(state) {
        this.nodes = [{ state }];
        this.currentNodeIndex = 0;
    }

    get state() {
        return this.nodes[this.currentNodeIndex].state;
    }

    /**
     * @param {S} state The new state
     * @param {Action} action The action that led to the new state
     * @param {boolean} [notify] Notify listeners
     */
    push(state, action, notify = true) {
        if (this.isRedoable()) {
            // Discard future nodes.
            // TODO: Branch
            this.nodes = this.nodes.slice(0, this.currentNodeIndex + 1);
        }

        this.nodes.push({ state, action });
        this.currentNodeIndex++;

        if (notify) {
            this._notifyListeners();
        }
    }

    isRedoable() {
        return this.currentNodeIndex < this.nodes.length - 1;
    }

    redo() {
        if (this.isRedoable()) {
            this.currentNodeIndex++;
        }
        this._notifyListeners();
    }

    isUndoable() {
        return this.currentNodeIndex > 0;
    }

    undo() {
        if (this.isUndoable()) {
            this.currentNodeIndex--;
        }
        this._notifyListeners();
    }

    isAtInitialState() {
        return this.currentNodeIndex == 0;
    }

    isEmpty() {
        return this.nodes.length <= 1;
    }

    /**
     *
     * @param {number} index
     */
    activateState(index) {
        if (index < 0 || index >= this.nodes.length) {
            throw new Error("State node index out of bounds!");
        }

        this.currentNodeIndex = index;
        this._notifyListeners();
    }

    /**
     * Returns the history up to the current node
     */
    getActionHistory() {
        return this.nodes
            .slice(1, this.currentNodeIndex + 1)
            .map(d => d.action);
    }

    getFullActionHistory() {
        return this.nodes.map(d => d.action);
    }
}
