import { afterEach, expect, test, vi } from "vitest";
import { installWebGpuLimitAudit } from "./webGpuLimitAudit.js";

afterEach(() => vi.unstubAllGlobals());

test("rejects raised limits before creating a device", async () => {
    const { adapter, requestDevice, audit } = createHarness();
    await expect(
        adapter.requestDevice({
            requiredLimits: { maxStorageBuffersPerShaderStage: 10 },
        })
    ).rejects.toThrow("rejects requiredLimits");
    expect(requestDevice).not.toHaveBeenCalled();
    expect(audit.violations).toHaveLength(1);
});

test("counts storage visibility across groups and records binding sizes and GPU errors", async () => {
    const { adapter, audit } = createHarness();
    const device = await adapter.requestDevice();
    const global = device.createBindGroupLayout({
        entries: [{ binding: 0, visibility: 3, buffer: {} }],
    });
    const mark = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: 1,
                buffer: { type: "read-only-storage" },
            },
            { binding: 1, visibility: 2, buffer: { type: "storage" } },
            {
                binding: 2,
                visibility: 3,
                buffer: { type: "read-only-storage" },
            },
        ],
    });
    const placement = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: 1,
                buffer: { type: "read-only-storage" },
            },
        ],
    });
    device.createPipelineLayout({
        bindGroupLayouts: [global, mark, placement],
    });
    const buffer = device.createBuffer({ size: 1024 });
    device.createBindGroup({
        layout: mark,
        entries: [{ binding: 0, resource: { buffer, offset: 256 } }],
    });
    device.dispatchEvent(
        Object.assign(new Event("uncapturederror"), {
            error: { message: "validation failed" },
        })
    );

    const record = audit.devices[0];
    expect(record.limits.maxStorageBuffersPerShaderStage).toBe(8);
    expect(
        record.layouts[0].stages.vertex.maxStorageBuffersPerShaderStage
    ).toBe(3);
    expect(
        record.layouts[0].stages.fragment.maxStorageBuffersPerShaderStage
    ).toBe(2);
    expect(record.peaks.maxBindGroups.used).toBe(3);
    expect(record.peaks.maxStorageBufferBindingSize.used).toBe(768);
    expect(record.validationErrors).toEqual(["validation failed"]);
});

/** Browser-shaped device with limits on its prototype, as in Chromium. */
function createHarness() {
    const device = Object.assign(new EventTarget(), {
        limits: Object.create({
            maxBindGroups: 4,
            maxBindingsPerBindGroup: 1000,
            maxStorageBuffersPerShaderStage: 8,
            maxUniformBuffersPerShaderStage: 12,
            maxBufferSize: 268435456,
            maxStorageBufferBindingSize: 134217728,
        }),
        createBindGroupLayout: () => ({}),
        createPipelineLayout: () => ({}),
        createBuffer: (/** @type {{size: number}} */ descriptor) => ({
            size: descriptor.size,
        }),
        createBindGroup: () => ({}),
    });
    const requestDevice = vi.fn(async () => device);
    class Adapter {}
    Adapter.prototype.requestDevice = requestDevice;
    const browserWindow = {};
    vi.stubGlobal("GPUAdapter", Adapter);
    vi.stubGlobal("window", browserWindow);
    installWebGpuLimitAudit();
    return {
        adapter: new Adapter(),
        requestDevice,
        audit: browserWindow.__webGpuLimitAudit,
    };
}
/* global Event, EventTarget */
