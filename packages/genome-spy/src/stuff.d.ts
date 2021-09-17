// TODO: Find a better place for this

type ObjectKeys<T> = T extends object
    ? (keyof T)[]
    : T extends number
    ? []
    : T extends Array<any> | string
    ? string[]
    : never;

interface ObjectConstructor {
    // Source: https://fettblog.eu/typescript-better-object-keys/
    keys<T>(o: T): ObjectKeys<T>;

    // Source: https://github.com/microsoft/TypeScript/issues/35101
    entries<T>(
        o: T
    ): T extends ArrayLike<infer U>
        ? [string, U][]
        : { [K in keyof T]: [K, T[K]] }[keyof T][];
    values<T>(o: T): T extends ArrayLike<infer U> ? U[] : T[keyof T][];
}
