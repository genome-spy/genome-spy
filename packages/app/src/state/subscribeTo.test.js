import { describe, it, expect, vi } from "vitest";
import { subscribeTo, withMicrotask } from "./subscribeTo.js";

/**
 * @template S
 * @typedef {Object} MockStore
 * @property {() => S} getState
 * @property {(next: S) => void} setState
 * @property {(fn: () => void) => () => void} subscribe
 */

/**
 * @template S, T
 * @typedef {(state: S) => T} Selector
 */

/**
 * @template T
 * @typedef {(nextSlice: T, prevSlice: T) => void} Listener
 */

/**
 * @template S
 * @param {S} initialState
 * @returns {MockStore<S>}
 */
function createMockStore(initialState) {
    let state = initialState;
    const subs = new Set();

    return {
        getState() {
            return state;
        },
        setState(next) {
            state = next;
            // call subscribers in insertion order
            for (const s of Array.from(subs)) s();
        },
        subscribe(fn) {
            subs.add(fn);
            return () => subs.delete(fn);
        },
    };
}

describe("subscribeTo", () => {
    it("calls listener when selected slice changes and returns unsubscribe", () => {
        /** @type {{a:number,b:number}} */
        const initial = { a: 1, b: 10 };
        /** @type {MockStore<{a:number,b:number}>} */
        const store = createMockStore(initial);
        /** @type {Selector<{a:number,b:number}, number>} */
        const selector = (s) => s.a;
        /** @type {Listener<number>} */
        const listener = vi.fn();

        const unsubscribe = subscribeTo(store, selector, listener);

        // changing an unrelated property does not trigger listener
        store.setState({ a: 1, b: 11 });
        expect(listener).not.toHaveBeenCalled();

        // changing the selected slice triggers listener with next and prev
        store.setState({ a: 2, b: 11 });
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(2, 1);

        // unsubscribe stops further notifications
        unsubscribe();
        store.setState({ a: 3, b: 11 });
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it("respects custom equality function", () => {
        /** @type {{v:number}} */
        const initial = { v: 0 };
        /** @type {MockStore<{v:number}>} */
        const store = createMockStore(initial);
        /** @type {Selector<{v:number}, number>} */
        const selector = (s) => s.v;
        // consider values equal when their parity is equal
        /** @type {(a:number,b:number)=>boolean} */
        const equals = (a, b) => a % 2 === b % 2;
        /** @type {Listener<number>} */
        const listener = vi.fn();

        const unsubscribe = subscribeTo(store, selector, listener, equals);

        // change from 0 -> 1 (parity differs) -> should notify
        store.setState({ v: 1 });
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(1, 0);

        // change from 1 -> 3 (parity same) -> should NOT notify
        store.setState({ v: 3 });
        expect(listener).toHaveBeenCalledTimes(1);

        unsubscribe();
    });
});

describe("withMicrotask", () => {
    it("debounces multiple calls into a single microtask with latest next and first prev", async () => {
        /** @type {Listener<number>} */
        const listener = vi.fn();
        /** @type {(next:number, prev:number)=>void} */
        const wrapped = withMicrotask(listener);

        // call multiple times synchronously
        wrapped(1, 0);
        wrapped(2, 1);
        wrapped(3, 2);

        // allow microtasks to run
        await Promise.resolve();

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(3, 0);

        // next tick: new call should schedule another run
        wrapped(4, 3);
        await Promise.resolve();
        expect(listener).toHaveBeenCalledTimes(2);
        expect(listener).toHaveBeenLastCalledWith(4, 3);
    });
});
