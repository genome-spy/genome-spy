import PointProgram from "../marks/programs/pointProgram.js";
import { isSeriesChannelConfig } from "../types.js";
import { LassoSelection } from "./lassoSelection.js";
import { HASH_EMPTY_KEY } from "./hashTable.js";

/** @type {WeakMap<PointProgram, GPUComputePipeline>} */
const projectionPipelines = new WeakMap();

const LASSO_PROJECTION_WGSL = /* wgsl */ `
@group(2) @binding(0) var<storage, read_write> lassoX: array<f32>;
@group(2) @binding(1) var<storage, read_write> lassoY: array<f32>;
@group(2) @binding(2) var<storage, read_write> lassoIds: array<u32>;

@compute @workgroup_size(128)
fn captureLasso(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) groups: vec3<u32>) {
    let i = gid.x + gid.y * groups.x * 128u;
    if (i >= arrayLength(&lassoIds)) { return; }
    let center = getPointCenter(i);
    lassoX[i] = center.x;
    lassoY[i] = center.y;
    lassoIds[i] = getScaled_uniqueId(i);
}
`;

/**
 * Captures f32 point centers in the current x/y range coordinate space.
 * The returned utility owns the snapshot independently of subsequent mark updates.
 * @param {import("../renderer.js").Renderer} renderer
 * @param {Pick<import("../index.d.ts").MarkHandle, "markId">} mark
 */
export function createPointLassoSelection(renderer, mark) {
    renderer._assertAlive();
    const program = renderer._marks.get(mark.markId);
    if (!(program instanceof PointProgram))
        throw new Error(
            "Point lasso requires a live point mark on this renderer."
        );
    program._assertAlive();
    const { device, count } = program;
    const ids = program._channels.uniqueId;
    if (
        !ids ||
        !isSeriesChannelConfig(ids) ||
        !(ids.data instanceof Uint32Array) ||
        ids.type !== "u32" ||
        ids.scale ||
        ids.conditions?.length ||
        ids.data.subarray(0, count).includes(HASH_EMPTY_KEY)
    ) {
        throw new Error(
            "Point lasso requires an unscaled u32 ID series excluding 0xffffffff."
        );
    }
    if (
        program._placementIndex ||
        ["x", "y", "xOffset", "yOffset", "dx", "dy"].some(
            (name) => program._channels[name].conditions?.length
        )
    ) {
        throw new Error(
            "Point lasso does not support conditional positions or repeated placements."
        );
    }

    const storageBuffers = program._computeStorageBufferCount + 3;
    const limit = device.limits.maxStorageBuffersPerShaderStage;
    if (storageBuffers > limit) {
        throw new Error(
            `Point lasso requires ${storageBuffers} compute storage buffers; device limit is ${limit}.`
        );
    }

    let pipeline = projectionPipelines.get(program);
    if (!pipeline) {
        const outputLayout = device.createBindGroupLayout({
            entries: [0, 1, 2].map((binding) => ({
                binding,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "storage" },
            })),
        });
        pipeline = device.createComputePipeline({
            label: "point lasso projection",
            layout: device.createPipelineLayout({
                bindGroupLayouts: [
                    renderer._globalBindGroupLayout,
                    program._bindGroupLayout,
                    outputLayout,
                ],
            }),
            compute: {
                module: device.createShaderModule({
                    code: program._shaderCode + LASSO_PROJECTION_WGSL,
                }),
                entryPoint: "captureLasso",
            },
        });
        projectionPipelines.set(program, pipeline);
    }
    const inputs = ["x", "y", "ids"].map((name) =>
        device.createBuffer({
            label: "point lasso " + name,
            size: Math.max(4, count * 4),
            usage: GPUBufferUsage.STORAGE,
        })
    );
    /** @type {LassoSelection} */
    let lasso;
    try {
        lasso = new LassoSelection(device, {
            x: inputs[0],
            y: inputs[1],
            ids: inputs[2],
            count,
        });
    } catch (error) {
        for (const buffer of inputs) buffer.destroy();
        throw error;
    }
    if (count) {
        const encoder = device.createCommandEncoder({
            label: "point lasso capture",
        });
        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, renderer._globalBindGroup, [0]);
        pass.setBindGroup(1, program._bindGroup);
        pass.setBindGroup(
            2,
            device.createBindGroup({
                layout: pipeline.getBindGroupLayout(2),
                entries: inputs.map((buffer, binding) => ({
                    binding,
                    resource: { buffer },
                })),
            })
        );
        const groups = Math.ceil(count / 128);
        const height = Math.ceil(
            groups / device.limits.maxComputeWorkgroupsPerDimension
        );
        pass.dispatchWorkgroups(Math.ceil(groups / height), height);
        pass.end();
        device.queue.submit([encoder.finish()]);
    }
    return lasso;
}
