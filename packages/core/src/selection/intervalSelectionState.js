import {
    createIntervalSelection,
    isActiveIntervalSelection,
} from "./selection.js";
import deepEqual from "../utils/deepEqual.js";

/** Shared semantic state; controllers own only gestures and screen geometry. */
export default class IntervalSelectionState {
    /** @type {import("../paramRuntime/viewParamRuntime.js").default} */
    #runtime;

    /** @type {string} */
    #name;

    /** @type {{ host: object, cancel: () => void, initial: import("../types/selectionTypes.js").IntervalSelection } | undefined} */
    #gesture;

    /** @type {Set<(value: import("../types/selectionTypes.js").IntervalSelection) => void>} */
    #listeners = new Set();

    #pendingCommit = false;

    /** @type {import("../paramRuntime/types.js").WritableParamRef<number>} */
    #completion;

    /** @type {() => void} */
    #disposeEffect;

    /** @param {import("../paramRuntime/viewParamRuntime.js").default} runtime
     * @param {string} name
     */
    constructor(runtime, name) {
        this.#runtime = runtime;
        this.#name = name;
        this.#completion = runtime.signal("intervalCompletion", 0);
        this.#disposeEffect = runtime.effect(
            [runtime.getParamRef(name), this.#completion],
            () => {
                if (!this.#pendingCommit) return;
                this.#pendingCommit = false;
                for (const listener of Array.from(this.#listeners)) {
                    try {
                        listener(runtime.getValue(name));
                    } catch (error) {
                        console.error(error);
                    }
                }
            }
        );
    }

    /** @param {import("../types/selectionTypes.js").IntervalSelection} value
     * @param {object} [host]
     */
    beforeWrite(value, host) {
        if (this.#gesture && host !== this.#gesture.host) this.cancel();
        this.#pendingCommit =
            !this.#gesture &&
            !deepEqual(value, this.#runtime.getValue(this.#name));
    }

    /** @param {object} host
     * @param {() => void} cancel
     */
    begin(host, cancel) {
        this.cancel();
        this.#gesture = {
            host,
            cancel,
            initial: structuredClone(this.#runtime.getValue(this.#name)),
        };
    }

    /** @param {object} host
     * @param {boolean} commit
     */
    finish(host, commit) {
        if (this.#gesture?.host !== host) return;
        const initial = this.#gesture.initial;
        this.#gesture = undefined;
        if (commit && !deepEqual(initial, this.#runtime.getValue(this.#name))) {
            this.#pendingCommit = true;
            this.#completion.set(this.#completion.get() + 1);
            this.#runtime.flushNow();
        }
    }

    cancel() {
        const gesture = this.#gesture;
        this.#gesture = undefined;
        gesture?.cancel();
    }

    clear() {
        this.cancel();
        const value = this.#runtime.getValue(this.#name);
        if (isActiveIntervalSelection(value)) {
            this.#runtime.setValue(
                this.#name,
                createIntervalSelection(
                    /** @type {import("../spec/channel.js").ChannelWithScale[]} */ (
                        Object.keys(value.intervals)
                    )
                )
            );
        }
    }

    /** @param {(value: import("../types/selectionTypes.js").IntervalSelection) => void} listener */
    subscribeCommit(listener) {
        this.#listeners.add(listener);
        return () => {
            this.#listeners.delete(listener);
        };
    }

    dispose() {
        this.cancel();
        this.#disposeEffect();
        this.#listeners.clear();
    }
}
