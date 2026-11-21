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
        x0: RasterCellArray;
        x1: RasterCellArray;
        y0: RasterCellArray;
        y1: RasterCellArray;
        columns: Uint32Array;
        rows: Uint32Array;
        offsets: Uint32Array;
        /** Tile indices into the placement table supplied at draw time. */
        placementIndices?: Uint32Array;
    };
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
     * Cells divide each tile uniformly between its projected endpoints.
     * An omitted end descriptor takes the initial mapping from its axis.
     * Retained scale slots are available separately for each edge.
     */
    position?: {
        x?: RasterPosition;
        x2?: RasterPosition;
        y?: RasterPosition;
        y2?: RasterPosition;
    };
    /**
     * Conditions, visibility and order use cell inputs. Interval projections
     * use one Float32Array field each. Multi selections use Uint32Array IDs.
     * Membership by a picked single ID is unavailable for raster cells.
     */
    channels?: { fill?: RasterCellChannel; opacity?: RasterCellChannel };
    placement?: "draw";
};

export const rasterMark: MarkDefinition<RasterConfig, RasterData>;
