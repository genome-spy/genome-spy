import LASSO_WGSL from "../wgsl/lasso.wgsl.js";
import { DEFAULT_MAX_LOAD_FACTOR, HASH_EMPTY_KEY } from "./hashTable.js";

/** GPU-resident lasso membership over immutable, already projected positions. */
export class LassoSelection {
    /**
     * @param {GPUDevice} device
     * @param {import("./lassoSelection.d.ts").LassoData} data
     */
    constructor(device, data) {
        const gpuInput = "count" in data;
        /** @type {number} */
        let count;
        if (gpuInput) {
            count = data.count;
            if (
                !Number.isSafeInteger(count) ||
                count < 0 ||
                count > 0xffffffff ||
                [data.x, data.y, data.ids].some(
                    (buffer) =>
                        !(buffer instanceof GPUBuffer) ||
                        buffer.size < Math.max(4, count * 4) ||
                        !(buffer.usage & GPUBufferUsage.STORAGE)
                )
            ) {
                throw new Error(
                    "Lasso requires a u32 count and three sufficiently sized storage buffers."
                );
            }
        } else {
            const { x, y, ids } = data;
            if (
                !(x instanceof Float32Array) ||
                !(y instanceof Float32Array) ||
                !(ids instanceof Uint32Array) ||
                x.length !== y.length ||
                x.length !== ids.length ||
                ids.some((id) => id === HASH_EMPTY_KEY)
            ) {
                throw new Error(
                    "Lasso requires equal-length f32 x/y and u32 IDs excluding 0xffffffff."
                );
            }
            count = ids.length;
        }
        this.device = device;
        this.count = count;
        this.capacity =
            2 **
            Math.ceil(Math.log2(Math.max(1, count / DEFAULT_MAX_LOAD_FACTOR)));
        const largest = Math.max(
            this.capacity * 8,
            gpuInput
                ? Math.max(data.x.size, data.y.size, data.ids.size)
                : Math.max(4, count * 4)
        );
        if (
            largest > device.limits.maxBufferSize ||
            largest > device.limits.maxStorageBufferBindingSize
        ) {
            throw new Error(
                `Lasso requires a ${largest}-byte storage buffer; device limits are insufficient.`
            );
        }
        /** @type {GPUBuffer[]} */
        this.buffers = [];
        /** @param {number} size @param {number} usage */
        const allocate = (size, usage) => {
            const buffer = device.createBuffer({
                label: "lasso",
                size: Math.max(4, size),
                usage,
            });
            this.buffers.push(buffer);
            return buffer;
        };
        this.density = [0, 1].map(() =>
            device.createBuffer({ size: 4, usage: GPUBufferUsage.STORAGE })
        );
        const inputs = gpuInput
            ? [data.x, data.y, data.ids]
            : [data.x, data.y, data.ids].map((array) => {
                  const buffer = allocate(
                      array.byteLength,
                      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
                  );
                  if (array.byteLength)
                      device.queue.writeBuffer(
                          buffer,
                          0,
                          /** @type {GPUAllowSharedBufferSource} */ (array)
                      );
                  return buffer;
              });
        if (gpuInput) this.buffers.push(...inputs);
        // shortcut: 512 vertices per polygon, simplify longer traces before increasing GPU work.
        this.polygonBuffer = allocate(
            512 * 8,
            GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        );
        this.#table = allocate(this.capacity * 8, GPUBufferUsage.STORAGE);
        this.selected = allocate(
            Math.max(8, count * 8),
            GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
        );
        this.selectedCount = allocate(
            4,
            GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
        );
        this.settings = allocate(
            64,
            GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        );
        const module = device.createShaderModule({
            label: "lasso",
            code: LASSO_WGSL,
        });
        this.layout = device.createBindGroupLayout({
            entries: [
                ...Array.from({ length: 7 }, (_, binding) => ({
                    binding,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {
                        type: /** @type {GPUBufferBindingType} */ (
                            binding < 4 ? "read-only-storage" : "storage"
                        ),
                    },
                })),
                {
                    binding: 7,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" },
                },
                {
                    binding: 8,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" },
                },
            ],
        });
        const pipelineLayout = device.createPipelineLayout({
            bindGroupLayouts: [this.layout],
        });
        this.clearPipeline = device.createComputePipeline({
            layout: pipelineLayout,
            compute: {
                module,
                entryPoint: "clear",
            },
        });
        this.clearDensityPipeline = device.createComputePipeline({
            layout: "auto",
            compute: { module, entryPoint: "clearDensity" },
        });
        this.selectPipeline = device.createComputePipeline({
            layout: pipelineLayout,
            compute: {
                module,
                entryPoint: "select",
            },
        });
        this.totalPipeline = device.createComputePipeline({
            layout: pipelineLayout,
            compute: { module, entryPoint: "total" },
        });
        this.bindings = [
            ...inputs,
            this.polygonBuffer,
            this.#table,
            this.selected,
            this.selectedCount,
            this.settings,
        ];
        this.bindGroup = this.createDensityBinding(this.density[1]);
        this.clear();
    }

    /** @type {GPUDevice} */
    device;

    /** @type {number} */
    count;

    /** @type {number} */
    capacity;

    /** @type {GPUBuffer[]} */
    buffers;

    /** @type {GPUBuffer} */
    polygonBuffer;

    /** @type {GPUBuffer} */
    #table;

    /** Borrowed by multi-selection slots; destroy the consumer before this utility. */
    get table() {
        return this.#table;
    }

    ownsTable = true;

    /** Transfers the table to a consumer; remaining snapshot resources stay owned here. */
    takeTable() {
        if (this.destroyed || !this.ownsTable)
            throw new Error("Lasso table ownership has already ended.");
        const table = this.table;
        this.buffers.splice(this.buffers.indexOf(table), 1);
        this.ownsTable = false;
        return table;
    }

    /** @type {GPUBuffer} */
    selected;

    /** @type {GPUBuffer} */
    selectedCount;

    /** @type {GPUBuffer} */
    settings;

    /** @type {GPUComputePipeline} */
    clearPipeline;

    /** @type {GPUComputePipeline} */
    selectPipeline;

    /** @type {GPUBindGroup} */
    bindGroup;

    /** @type {GPUBindGroupLayout} */
    layout;

    /** @type {GPUBuffer[]} */
    bindings;

    /** @type {GPUBuffer[]} */
    density;

    /** @type {GPUComputePipeline} */
    totalPipeline;

    grid = new Uint32Array(2);

    /** @param {GPUBuffer} density */
    createDensityBinding(density) {
        return this.device.createBindGroup({
            layout: this.layout,
            entries: [...this.bindings, density].map((buffer, binding) => ({
                binding,
                resource: { buffer },
            })),
        });
    }

    /**
     * Enable per-pixel row counts within the view [x0,y0,x1,y1]. Returned buffers
     * are borrowed until the next resize or destruction; call after prior GPU work completes.
     * @param {number} width @param {number} height
     * @param {readonly [number,number,number,number]} [view]
     * @param {readonly [number,number,number,number]} [bounds] Eligible centers; defaults to view, independently of pixel bin mapping.
     */
    setDensityGrid(width, height, view = [0, 0, 1, 1], bounds = view) {
        if (this.destroyed) throw new Error("Lasso utility is destroyed.");
        const domain = new Float32Array(view);
        if (
            domain.length !== 4 ||
            !domain.every(Number.isFinite) ||
            domain[2] === domain[0] ||
            domain[3] === domain[1]
        )
            throw new Error("Density view requires finite nonzero f32 spans.");
        const extent = new Float32Array(bounds);
        if (
            extent.length !== 4 ||
            !extent.every(Number.isFinite) ||
            extent[2] === extent[0] ||
            extent[3] === extent[1]
        )
            throw new Error("Density bounds require finite nonzero f32 spans.");
        const bytes = width * height * 4;
        if (
            !Number.isSafeInteger(width) ||
            !Number.isSafeInteger(height) ||
            width < 1 ||
            height < 1 ||
            !Number.isSafeInteger(bytes) ||
            bytes > this.device.limits.maxStorageBufferBindingSize ||
            bytes > this.device.limits.maxBufferSize
        )
            throw new Error("Density grid exceeds device limits.");
        for (const buffer of this.density) buffer.destroy();
        this.density = [0, 1].map(() =>
            this.device.createBuffer({
                size: bytes,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
            })
        );
        this.grid.set([width, height]);
        this.device.queue.writeBuffer(
            this.settings,
            0,
            new Uint32Array([this.count])
        );
        this.device.queue.writeBuffer(this.settings, 8, this.grid);
        this.device.queue.writeBuffer(this.settings, 32, domain);
        this.device.queue.writeBuffer(
            this.settings,
            48,
            new Float32Array([
                Math.min(extent[0], extent[2]),
                Math.min(extent[1], extent[3]),
                Math.max(extent[0], extent[2]),
                Math.max(extent[1], extent[3]),
            ])
        );
        this.bindGroup = this.createDensityBinding(this.density[1]);
        const encoder = this.device.createCommandEncoder();
        const pass = encoder.beginComputePass({ label: "lasso total density" });
        pass.setPipeline(this.totalPipeline);
        pass.setBindGroup(0, this.createDensityBinding(this.density[0]));
        if (this.count) this.dispatch(pass, this.count);
        pass.end();
        this.device.queue.submit([encoder.finish()]);
        return { total: this.density[0], selected: this.density[1] };
    }

    revision = 0;

    /** @type {GPUComputePipeline | undefined} */
    committedDensityPipeline;

    /** Rebuild only the density from a borrowed, same-device hash table.
     * @param {GPUBuffer} table */
    updateDensity(table) {
        if (this.destroyed) throw new Error("Lasso utility is destroyed.");
        const capacity = table.size / 8;
        if (
            !(table.usage & GPUBufferUsage.STORAGE) ||
            table.mapState !== "unmapped" ||
            !Number.isSafeInteger(capacity) ||
            capacity < 1 ||
            Math.log2(capacity) % 1 !== 0 ||
            table.size > this.device.limits.maxStorageBufferBindingSize
        )
            throw new Error(
                "Density membership requires an unmapped storage hash table."
            );
        if (!this.committedDensityPipeline) {
            const storageBuffers = 5;
            if (
                this.device.limits.maxStorageBuffersPerShaderStage <
                storageBuffers
            )
                throw new Error(
                    `Committed density requires ${storageBuffers} compute storage buffers.`
                );
            this.committedDensityPipeline = this.device.createComputePipeline({
                layout: "auto",
                compute: {
                    module: this.device.createShaderModule({
                        code: LASSO_WGSL,
                    }),
                    entryPoint: "committedDensity",
                },
            });
        }
        const encoder = this.device.createCommandEncoder();
        const clear = encoder.beginComputePass();
        clear.setPipeline(this.clearDensityPipeline);
        clear.setBindGroup(
            0,
            this.device.createBindGroup({
                layout: this.clearDensityPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 8, resource: { buffer: this.density[1] } },
                ],
            })
        );
        this.dispatch(clear, this.density[1].size / 4);
        clear.end();
        const pass = encoder.beginComputePass({
            label: "committed lasso density",
        });
        pass.setPipeline(this.committedDensityPipeline);
        pass.setBindGroup(
            0,
            this.device.createBindGroup({
                layout: this.committedDensityPipeline.getBindGroupLayout(0),
                entries: [0, 1, 2, 7, 8].map((binding) => ({
                    binding,
                    resource: {
                        buffer:
                            binding === 8
                                ? this.density[1]
                                : this.bindings[binding],
                    },
                })),
            })
        );
        pass.setBindGroup(
            1,
            this.device.createBindGroup({
                layout: this.committedDensityPipeline.getBindGroupLayout(1),
                entries: [{ binding: 0, resource: { buffer: table } }],
            })
        );
        if (this.count) this.dispatch(pass, this.count);
        pass.end();
        this.device.queue.submit([encoder.finish()]);
    }

    destroyed = false;

    /** @param {GPUComputePassEncoder} pass @param {number} count */
    dispatch(pass, count) {
        const groups = Math.ceil(count / 128);
        const height = Math.ceil(
            groups / this.device.limits.maxComputeWorkgroupsPerDimension
        );
        pass.dispatchWorkgroups(Math.ceil(groups / height), height);
    }

    /** @param {ReadonlyArray<readonly [number,number]>} [polygon] */
    update(polygon) {
        if (this.destroyed) throw new Error("Lasso utility is destroyed.");
        if (!this.ownsTable)
            throw new Error("Cannot update a transferred lasso table.");
        if (polygon) {
            if (
                polygon.length < 3 ||
                polygon.length > 512 ||
                polygon.some((p) => p.length !== 2 || !p.every(Number.isFinite))
            ) {
                throw new Error("Lasso requires 3–512 finite vertices.");
            }
            const vertices = new Float32Array(
                polygon.flatMap((p) => [p[0], p[1]])
            );
            if (!vertices.every(Number.isFinite))
                throw new Error("Lasso vertices exceed f32 range.");
            const settings = new ArrayBuffer(32);
            new Uint32Array(settings, 0, 2).set([this.count, polygon.length]);
            new Uint32Array(settings, 8, 2).set(this.grid);
            const bounds = [Infinity, Infinity, -Infinity, -Infinity];
            for (let i = 0; i < vertices.length; i += 2) {
                bounds[0] = Math.min(bounds[0], vertices[i]);
                bounds[1] = Math.min(bounds[1], vertices[i + 1]);
                bounds[2] = Math.max(bounds[2], vertices[i]);
                bounds[3] = Math.max(bounds[3], vertices[i + 1]);
            }
            new Float32Array(settings, 16, 4).set(bounds);
            this.device.queue.writeBuffer(this.settings, 0, settings);
            this.device.queue.writeBuffer(this.polygonBuffer, 0, vertices);
        }
        const encoder = this.device.createCommandEncoder({
            label: "lasso update",
        });
        const clear = encoder.beginComputePass();
        clear.setPipeline(this.clearPipeline);
        clear.setBindGroup(0, this.bindGroup);
        this.dispatch(clear, Math.max(this.capacity, this.density[1].size / 4));
        clear.end();
        if (polygon && this.count) {
            const select = encoder.beginComputePass();
            select.setPipeline(this.selectPipeline);
            select.setBindGroup(0, this.bindGroup);
            this.dispatch(select, this.count);
            select.end();
        }
        this.device.queue.submit([encoder.finish()]);
        this.revision++;
    }

    clear() {
        this.update();
    }

    /** Returns a queue-ordered snapshot; later updates cannot change its IDs. */
    async readIds() {
        if (this.destroyed) throw new Error("Lasso utility is destroyed.");
        const revision = this.revision;
        // shortcut: population-sized readback, compact staging when measurements justify it.
        const staging = this.device.createBuffer({
            size: 4 + Math.max(8, this.count * 8),
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        const encoder = this.device.createCommandEncoder();
        encoder.copyBufferToBuffer(this.selectedCount, 0, staging, 0, 4);
        encoder.copyBufferToBuffer(
            this.selected,
            0,
            staging,
            4,
            Math.max(8, this.count * 8)
        );
        this.device.queue.submit([encoder.finish()]);
        try {
            await staging.mapAsync(GPUMapMode.READ);
            const data = new Uint32Array(staging.getMappedRange());
            const ids = new Uint32Array(data[0]);
            const indices = new Uint32Array(data[0]);
            for (let i = 0; i < ids.length; i++) {
                ids[i] = data[1 + i * 2];
                indices[i] = data[2 + i * 2];
            }
            return { revision, ids, indices };
        } finally {
            staging.destroy();
        }
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        for (const buffer of [...this.buffers, ...this.density])
            buffer.destroy();
    }
}
