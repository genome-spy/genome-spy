// Source: https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/d3-array/index.d.ts

declare module "internmap" {
    /**
     * The InternMap class extends the native JavaScript Map class, allowing Dates and other non-primitive keys by bypassing the SameValueZero algorithm when determining key equality.
     */
    export class InternMap<K = any, V = any> extends Map<K, V> {}

    /**
     * The InternSet class extends the native JavaScript Set class, allowing Dates and other non-primitive keys by bypassing the SameValueZero algorithm when determining key equality.
     */
    export class InternSet<T = any> extends Set<T> {}
}
