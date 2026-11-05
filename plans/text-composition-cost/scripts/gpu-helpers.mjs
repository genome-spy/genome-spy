/* global window, navigator, GPUAdapter, GPUBufferUsage, GPUMapMode, costScene */

/** Request timestamp support for diagnostic devices only. */
export async function timestamps() {
    const adapter = await navigator.gpu.requestAdapter();
    const available = adapter.features.has("timestamp-query");
    window.costAdapter = {
        info: {
            vendor: adapter.info.vendor,
            architecture: adapter.info.architecture,
            device: adapter.info.device,
            description: adapter.info.description,
        },
        timestampQuery: available,
        userAgent: navigator.userAgent,
    };
    if (!available) return window.costAdapter;
    const original = GPUAdapter.prototype.requestDevice;
    GPUAdapter.prototype.requestDevice = function (descriptor = {}) {
        return original.call(this, {
            ...descriptor,
            requiredFeatures: [
                ...new Set([
                    ...(descriptor.requiredFeatures ?? []),
                    "timestamp-query",
                ]),
            ],
        });
    };
    return window.costAdapter;
}
/** Install whole-pass timestamps; shader code is unchanged. */
export function installGpu() {
    const s = costScene,
        d = s.renderer.device;
    const queries = d.createQuerySet({ type: "timestamp", count: 2 });
    const resolved = d.createBuffer({
        size: 256,
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });
    const read = d.createBuffer({
        size: 16,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const create = d.createCommandEncoder.bind(d);
    d.createCommandEncoder = function (descriptor) {
        const encoder = create(descriptor),
            begin = encoder.beginRenderPass.bind(encoder);
        encoder.beginRenderPass = function (descriptor) {
            const active = s.gpuTiming === true;
            if (active) {
                s.gpuPasses++;
                descriptor = {
                    ...descriptor,
                    timestampWrites: {
                        querySet: queries,
                        beginningOfPassWriteIndex: 0,
                        endOfPassWriteIndex: 1,
                    },
                };
            }
            const pass = begin(descriptor),
                draw = pass.draw.bind(pass);
            if (active)
                pass.draw = function (
                    vertexCount,
                    instanceCount,
                    firstVertex,
                    firstInstance
                ) {
                    s.gpuDraws.push({
                        vertexCount,
                        instanceCount,
                        firstVertex,
                        firstInstance,
                    });
                    return draw(
                        vertexCount,
                        instanceCount,
                        firstVertex,
                        firstInstance
                    );
                };
            return pass;
        };
        return encoder;
    };
    window.gpuSample = async () => {
        await d.queue.onSubmittedWorkDone();
        s.gpuPasses = 0;
        s.gpuDraws = [];
        s.gpuTiming = true;
        s.renderer.render({
            items: [{ mark: s.mark }],
            clearColor: { r: 0, g: 0, b: 0, a: 0 },
        });
        s.gpuTiming = false;
        if (s.gpuPasses !== 1)
            throw Error(
                "Expected exactly one measured pass, received " + s.gpuPasses
            );
        const encoder = create();
        encoder.resolveQuerySet(queries, 0, 2, resolved, 0);
        encoder.copyBufferToBuffer(resolved, 0, read, 0, 16);
        d.queue.submit([encoder.finish()]);
        await read.mapAsync(GPUMapMode.READ);
        const values = new BigUint64Array(read.getMappedRange()),
            ns = values[1] - values[0];
        read.unmap();
        if (ns < 0n) throw Error("Invalid timestamps");
        return {
            nanoseconds: ns.toString(),
            milliseconds: Number(ns) / 1e6,
            draws: s.gpuDraws,
        };
    };
    window.destroyGpuQueries = () => {
        queries.destroy();
        resolved.destroy();
        read.destroy();
    };
}
