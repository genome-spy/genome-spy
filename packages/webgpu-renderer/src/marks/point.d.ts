import type {
    PointMarkConfig,
    MarkDefinition,
    MarkHandle,
    Renderer,
} from "../index.js";
import type { LassoSelection } from "../utils/lassoSelection.js";

export const pointMark: MarkDefinition<PointMarkConfig>;

/**
 * Experimental f32 snapshot of current point centers in the x/y range coordinate space.
 * Requires unconditional positions, unscaled u32 ID series, and no placementIndex.
 * Rejects capture before allocation when its storage bindings exceed device limits.
 * Later series, scale, or value updates do not change the snapshot. Destroy marks
 * borrowing its table before destroying the utility; the source mark may be removed.
 */
export function createPointLassoSelection(
    renderer: Renderer,
    mark: Pick<MarkHandle, "markId">
): LassoSelection;

/** Experimental density display for a uniform neutral fill plus one constant fill condition on white.
 * Rebuild after any scene change. Polygon updates compute f32 membership and a borrowable hash table;
 * renderSelection uses the source's IDs. Transfer the table before destroying its snapshot. */
export function createPointDensityPreview(
    renderer: Renderer,
    mark: MarkHandle,
    options: {
        draw: () => void;
        view: readonly [number, number, number, number];
        viewport: readonly [number, number, number, number];
        /** Eligible point centers; defaults to view. Pixel bins still follow view. */
        bounds?: readonly [number, number, number, number];
        neutral: readonly number[];
        highlight: readonly number[];
    }
): {
    readonly table: GPUBuffer;
    readIds(): ReturnType<LassoSelection["readIds"]>;
    takeTable(): GPUBuffer;
    update(polygon: ReadonlyArray<readonly [number, number]>): Promise<void>;
    renderSelection(selection: string): Promise<void>;
    stop(): void;
    render(): void;
    destroy(): void;
};
