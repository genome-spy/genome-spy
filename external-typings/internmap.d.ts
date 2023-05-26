// Source: https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/d3-array/index.d.ts

declare module "internmap" {
    /**
     * The InternMap class extends the native JavaScript Map class, allowing Dates and other non-primitive keys by bypassing the SameValueZero algorithm when determining key equality.
     */
    export class InternMap<K = any, V = any> extends Map<K, V> {
        constructor(
            entries?: readonly (readonly [K, V])[] | null,
            keyFunction?: KeyFunction
        );
    }

    /**
     * The InternSet class extends the native JavaScript Set class, allowing Dates and other non-primitive keys by bypassing the SameValueZero algorithm when determining key equality.
     */
    export class InternSet<T = any> extends Set<T> {
        constructor(values?: readonly T[] | null, keyFunction?: KeyFunction);
    }
}

type KeyFunction = (key: any) => string | number | bigint | boolean | symbol;
