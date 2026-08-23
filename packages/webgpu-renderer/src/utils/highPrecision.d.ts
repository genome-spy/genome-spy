/** Number of low bits reserved for the high-precision split. */
export const LOW_BITS: 12;
/** Base used for high/low splitting. */
export const BASE: 4096;

/** Pack one non-negative safe integer into high/low u32 components. */
export function packHighPrecisionU32(value: number): Uint32Array;

/** Pack non-negative safe integers into high/low u32 components. */
export function packHighPrecisionU32Array(
    values: ArrayLike<number>
): Uint32Array;

/** Pack values into a caller-provided high/low u32 buffer. */
export function packHighPrecisionU32ArrayInto(
    values: ArrayLike<number>,
    target: Uint32Array
): Uint32Array;

/** Pack a fractional domain start and extent for the index scale. */
export function packHighPrecisionDomain(
    start: number,
    end: number
): [number, number, number];
