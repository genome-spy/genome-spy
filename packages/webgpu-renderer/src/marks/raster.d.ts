import type {
    ChannelConfigCommon,
    ChannelConfigWithScaleInput,
    MarkConfig,
    MarkDefinition,
    NumericValue,
    SelectionPredicate,
} from "../index.js";

export type RasterCellArray = Float32Array | Uint32Array;

/**
 * Complete raster snapshot. Tile columns have one entry per tile, except
 * packed positions, which have two words per tile. All cell fields have the
 * same length. Offsets address row-major rectangles in those fields.
 * A retained replacement may change dimensions, offsets and lengths while
 * keeping the original field names and array types.
 */
export type RasterData = {
    tiles: {
        columns: Uint32Array;
        rows: Uint32Array;
        offsets: Uint32Array;
        /** Tile indices into the placement table supplied at draw time. */
        placementIndices?: Uint32Array;
    } & (
        | {
              x0: RasterCellArray;
              y0: RasterCellArray;
              x1: RasterCellArray;
              y1: RasterCellArray;
              size?: never;
          }
        | {
              /** Anchor coordinates when both trailing edges are omitted. */
              x0?: RasterCellArray;
              y0?: RasterCellArray;
              x1?: never;
              y1?: never;
              /** One source-cell area per tile, in square logical pixels after scaling. */
              size?: RasterCellArray;
          }
    );
    cells: Record<string, RasterCellArray>;
};

export type RasterPosition = Pick<
    ChannelConfigCommon,
    "band" | "gapAxis" | "gapPeer" | "gapBefore"
> & {
    /** Uint32Array edges require a scale that accepts unsigned inputs. */
    scale?: ChannelConfigWithScaleInput["scale"];
    /** Use two words per edge for a packed high-precision index. */
    inputComponents?: 1 | 2;
};

/** Constant or series mapping for anchored tile geometry. Series live in RasterData. */
export type RasterAnchor = RasterPosition & {
    value?: NumericValue;
    type?: "f32" | "u32";
    dynamic?: boolean;
};

/** The input names a raw cell field. A value is already in range space. */
type RasterCellValue =
    | { input: string; scale?: ChannelConfigWithScaleInput["scale"] }
    | { value: NumericValue; dynamic?: boolean };

export type RasterCellChannel = RasterCellValue & {
    conditions?: readonly (
        | { when: SelectionPredicate; value: NumericValue }
        | { when: SelectionPredicate; channel: RasterCellValue }
    )[];
};

export type RasterConfig = Pick<
    MarkConfig,
    "scalarSlots" | "visibleWhen" | "order"
> & {
    data: RasterData;
    /**
     * Rotate bounded tiles onto a diagonal baseline. Both axes must supply
     * endpoints projected in the horizontal view's logical pixels.
     */
    projection?: "triangle";
    /**
     * A tile with endpoints divides each axis uniformly between them.
     * An omitted end descriptor takes the initial mapping from its axis.
     * A tile with an anchor is centered in logical pixels at the projected x
     * and y. Its cell width and height are the square root of the resolved
     * size, which defaults to 1.
     */
    position?: {
        x?: RasterAnchor;
        x2?: RasterPosition;
        y?: RasterAnchor;
        y2?: RasterPosition;
        size?: RasterAnchor;
    };
    /**
     * Conditions, visibility and order use cell inputs. Interval projections
     * can address x/y cell bounds or Float32Array fields. Multi selections use Uint32Array IDs.
     * Membership by a picked single ID is unavailable for raster cells.
     */
    channels?: { fill?: RasterCellChannel; opacity?: RasterCellChannel };
    placement?: "draw";
};

export const rasterMark: MarkDefinition<RasterConfig, RasterData>;
