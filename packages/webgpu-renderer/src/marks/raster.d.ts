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
        /** One picking ID per tile. Omit to leave the raster out of picking. */
        pickingIds?: Uint32Array;
        x0: RasterCellArray;
        y0: RasterCellArray;
        x1: RasterCellArray;
        y1: RasterCellArray;
    };
    cells: Record<string, RasterCellArray>;
};

export type RasterSeries = RasterData & {
    /** One index per tile when replacing data on a mark with per-instance placement. */
    placementIndex?: Uint32Array;
};

export type RasterPosition = Pick<
    ChannelConfigCommon,
    "band" | "gapAxis" | "gapPeer" | "gapBefore"
> & {
    /** Uint32Array edges require a scale that accepts unsigned inputs. */
    scale?: ChannelConfigWithScaleInput["scale"];
    /** Use two words per edge for a packed high-precision index. */
    inputComponents?: 1 | 2;
    /** Band offset for the trailing endpoint. Defaults to the leading offset. */
    bandEnd?: number;
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

export type RasterConfig = Pick<MarkConfig, "order" | "placementIndex"> & {
    data: RasterData;
    visibleWhen?: SelectionPredicate;
    /**
     * Rotate bounded tiles onto a diagonal baseline. Both axes must supply
     * endpoints projected in the horizontal view's logical pixels.
     */
    projection?: "triangle";
    /**
     * A tile divides each axis uniformly between its endpoints.
     * Both endpoints use the same scale on each axis.
     */
    position?: {
        x?: RasterPosition;
        y?: RasterPosition;
    };
    /**
     * Conditions, visibility and order use cell inputs. Interval projections
     * can address x/y cell bounds or Float32Array fields. Multi selections use Uint32Array IDs.
     * Membership by a picked single ID is unavailable for raster cells.
     */
    channels?: { fill?: RasterCellChannel; opacity?: RasterCellChannel };
};

export const rasterMark: MarkDefinition<RasterConfig, RasterSeries>;
