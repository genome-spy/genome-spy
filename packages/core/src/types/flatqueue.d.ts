/**
 * Adapted from: https://github.com/mourner/flatqueue/blob/master/index.d.ts
 *
 * A version with typings is yet be released...
 */
declare module "flatqueue" {
    export default class FlatQueue<T> {
        /**
         * Number of items in the queue.
         */
        readonly length: number;

        constructor();

        /**
         * Removes all items from the queue.
         */
        clear(): void;

        /**
         * Adds `item` to the queue with the specified `priority`.
         *
         * `priority` must be a number. Items are sorted and returned from low to
         * high priority. Multiple items with the same priority value can be added
         * to the queue, but there is no guaranteed order between these items.
         */
        push(item: T, priority: number): void;

        /**
         * Removes and returns the item from the head of this queue, which is one of
         * the items with the lowest priority. If this queue is empty, returns
         * `undefined`.
         */
        pop(): T | undefined;

        /**
         * Returns the item from the head of this queue without removing it. If this
         * queue is empty, returns `undefined`.
         */
        peek(): T | undefined;

        /**
         * Returns the priority value of the item at the head of this queue without
         * removing it. If this queue is empty, returns `undefined`.
         */
        peekValue(): number | undefined;

        /**
         * Shrinks the internal arrays to `this.length`.
         */
        shrink(): void;
    }
}
