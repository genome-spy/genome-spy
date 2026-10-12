export type LassoData =
    | { x: Float32Array; y: Float32Array; ids: Uint32Array }
    | {
          /** Immutable f32 x/y and u32 IDs excluding 0xffffffff, on the same device. */
          x: GPUBuffer;
          y: GPUBuffer;
          ids: GPUBuffer;
          count: number;
      };

/** Experimental f32 containment over positions already in the polygon's coordinate space. */
export class LassoSelection {
    readonly device: GPUDevice;
    /**
     * GPU input buffers transfer ownership on successful construction; destroy() releases them.
     */
    constructor(device: GPUDevice, data: LassoData);
    /** Stable [key,value] hash buffer. Borrow it only on the same GPUDevice. */
    readonly table: GPUBuffer;
    /** Transfer ownership of the current table. Further polygon updates are rejected. */
    takeTable(): GPUBuffer;
    readonly revision: number;
    /** Queues clear and containment passes; rendering may follow without CPU readback. */
    update(polygon: ReadonlyArray<readonly [number, number]>): void;
    /** Borrowed row histograms for [x0,y0,x1,y1], default [0,0,1,1]; reversed spans are allowed.
     * Bounds accept eligible centers independently of pixel mapping and default to view.
     * Eligible centers beyond the pixel view enter its nearest edge bin. Rebuild after GPU work completes. */
    setDensityGrid(
        width: number,
        height: number,
        view?: readonly [number, number, number, number],
        bounds?: readonly [number, number, number, number]
    ): { total: GPUBuffer; selected: GPUBuffer };
    clear(): void;
    /** Rebuild the selected density from a borrowed same-device hash table without changing polygon membership. */
    updateDensity(table: GPUBuffer): void;
    /** Explicit population-sized staging copy; results carry the captured revision. */
    readIds(): Promise<{
        revision: number;
        ids: Uint32Array;
        indices: Uint32Array;
    }>;
    /** Destroy borrowing marks first. */
    destroy(): void;
}
