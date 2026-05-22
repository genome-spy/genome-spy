export interface ConcreteColorScale {
    domain: unknown[];
    range: string[];
}

export declare function getConcreteColorScale(
    scale: unknown
): ConcreteColorScale | undefined;

export declare function addValueColors<T>(
    items: T[],
    getValue: (item: T) => unknown,
    domain: unknown,
    range: unknown
): Array<T & { color?: string }>;
