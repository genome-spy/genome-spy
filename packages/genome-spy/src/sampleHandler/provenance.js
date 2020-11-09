/**
 * @typedef {object} ProvenanceNode
 * @prop {S} state The full state
 * @prop {any} [action] The action that changed the previous state to this state
 * @template S State
 */

/**
 * Handles provenance, undo/redo, etc..
 *
 * @template S State
 */
export default class Provenance {
    constructor() {
        /** @type {ProvenanceNode<S>[]} List of nodes. TODO: Replace with a tree */
        this.nodes = undefined;

        /** @type {number} */
        this.currentNodeIndex = undefined;

        /** @type {(function():void)[]} */
        this.listeners = [];
    }

    /**
     *
     * @param {function():void} listener
     */
    addListener(listener) {
        this.listeners.push(listener);
    }

    _notifyListeners() {
        for (const listener of this.listeners) {
            listener();
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
     * @param {any} action The action that led to the new state
     */
    push(state, action) {
        if (this.isRedoable()) {
            // Discard future nodes.
            // TODO: Branch
            this.nodes = this.nodes.slice(0, this.currentNodeIndex + 1);
        }

        this.nodes.push({ state, action });
        this.currentNodeIndex++;

        this._notifyListeners();
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

    getActionHistory() {
        return this.nodes
            .slice(1, this.currentNodeIndex + 1)
            .map(d => d.action);
    }
}
