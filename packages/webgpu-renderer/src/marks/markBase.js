import { buildMarkShader } from "./markShaderBuilder.js";

/**
 * @typedef {{ shaderCode: string, bufferBindings: GPUBindGroupLayoutEntry[] }} ShaderBuildResult
 */

/**
 * Base class for marks that build WGSL dynamically based on channel configs.
 * Subclasses supply channel lists, defaults, and shader bodies.
 */
export default class MarkBase {
    /**
     * @typedef {import("../index.d.ts").TypedArray} TypedArray
     * @typedef {import("../index.d.ts").ChannelConfig} ChannelConfig
     */

    /**
     * @param {import("../renderer.js").Renderer} renderer
     * @param {{ channels: Record<string, ChannelConfig>, count: number }} config
     */
    constructor(renderer, config) {
        this.renderer = renderer;
        this.device = renderer.device;
        this.count = config.count;

        this._channels = this._normalizeChannels(config.channels);
        this._buffersByField = new Map();
        this._bufferByArray = new Map();
        this._uniformLayout = [];
        this._uniformOffsets = new Map();
        this._uniformValues = new Float32Array(0);

        // Build a per-mark uniform layout. The layout can differ between marks,
        // but is stable for the lifetime of the mark.
        this._buildUniformLayout();
        this._uniformBuffer = this.device.createBuffer({
            size: this._uniformValues.byteLength,
            // eslint-disable-next-line no-undef
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this._writeUniforms();

        // Create a shader that matches the active channels (series vs values)
        // and the selected scale types. This keeps GPU programs minimal but makes
        // shader generation dynamic.
        const { shaderCode, bufferBindings } = this._buildShader();
        this._bindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    // eslint-disable-next-line no-undef
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" },
                },
                ...bufferBindings,
            ],
        });

        this._pipeline = this.device.createRenderPipeline({
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [
                    renderer._globalBindGroupLayout,
                    this._bindGroupLayout,
                ],
            }),
            vertex: {
                module: this.device.createShaderModule({
                    code: shaderCode,
                }),
                entryPoint: "vs_main",
            },
            fragment: {
                module: this.device.createShaderModule({
                    code: shaderCode,
                }),
                entryPoint: "fs_main",
                targets: [{ format: renderer.format }],
            },
            primitive: { topology: "triangle-list" },
        });

        // Initialize any series-backed channels.
        this.updateInstances(
            Object.fromEntries(
                Object.entries(this._channels)
                    .filter(([, v]) => this._isSeries(v))
                    .map(([k, v]) => [k, v.data])
            ),
            config.count
        );
    }

    /**
     * @returns {string[]}
     */
    get channelOrder() {
        return [];
    }

    /**
     * @returns {Record<string, ChannelConfig>}
     */
    get defaultChannelConfigs() {
        return {};
    }

    /**
     * @returns {Record<string, number|number[]>}
     */
    get defaultValues() {
        return {};
    }

    /**
     * @returns {string}
     */
    get shaderBody() {
        return "";
    }

    /**
     * @param {Record<string, TypedArray>} fields
     * @param {number} count
     * @returns {void}
     */
    updateInstances(fields, count) {
        this.count = count;

        // Upload any columnar buffers to the GPU. Buffer identity is deduplicated
        // so a single array can feed multiple channels.
        for (const [name, channel] of Object.entries(this._channels)) {
            if (!this._isSeries(channel)) {
                continue;
            }
            const array = fields[name] ?? channel.data;
            if (!array) {
                throw new Error(`Missing data for channel "${name}"`);
            }
            if (array.length < count * (channel.components ?? 1)) {
                throw new Error(
                    `Channel "${name}" length (${array.length}) is less than count (${count})`
                );
            }
            this._ensureBuffer(name, array);
        }

        const entries = [
            {
                binding: 0,
                resource: { buffer: this._uniformBuffer },
            },
        ];

        // Build storage buffer bindings in the same order as the shader expects.
        let bindingIndex = 1;
        for (const [name, channel] of Object.entries(this._channels)) {
            if (!this._isSeries(channel)) {
                continue;
            }
            entries.push({
                binding: bindingIndex++,
                resource: { buffer: this._buffersByField.get(name) },
            });
        }

        this._bindGroup = this.device.createBindGroup({
            layout: this._bindGroupLayout,
            entries,
        });
    }

    /**
     * @param {string} field
     * @param {TypedArray} array
     */
    _ensureBuffer(field, array) {
        // TODO: Decide whether identity-based deduplication is sufficient long-term.
        let buffer = this._bufferByArray.get(array);

        if (!buffer) {
            // Storage buffers are used for per-instance columnar data.
            buffer = this.device.createBuffer({
                size: array.byteLength,
                // eslint-disable-next-line no-undef
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            this._bufferByArray.set(array, buffer);
        }

        this.device.queue.writeBuffer(buffer, 0, array);
        this._buffersByField.set(field, buffer);
    }

    /**
     * @param {Record<string, number|number[]|{ domain?: [number, number], range?: [number, number] }>} uniforms
     * @returns {void}
     */
    updateUniforms(uniforms) {
        // Accept both direct channel uniforms and scale domain/range updates.
        for (const [key, value] of Object.entries(uniforms)) {
            if (key.endsWith(".domain") || key.endsWith(".range")) {
                const [channelName, suffix] = key.split(".");
                const offsetKey =
                    suffix === "domain"
                        ? `${channelName}_domain`
                        : `${channelName}_range`;
                this._setUniformVec2(offsetKey, value);
            } else {
                this._setUniformValue(key, value);
            }
        }
        this._writeUniforms();
    }

    /**
     * @returns {void}
     */
    _buildUniformLayout() {
        /** @type {string[]} */
        const layout = [];

        // Create uniform slots for per-channel values and scale parameters.
        for (const [name, channel] of Object.entries(this._channels)) {
            if (this._isValue(channel)) {
                layout.push(name);
            }
            if (this._isSeries(channel) && channel.scale?.type === "linear") {
                layout.push(`${name}_domain`);
                layout.push(`${name}_range`);
            }
            if (this._isValue(channel) && channel.scale?.type === "linear") {
                layout.push(`${name}_domain`);
                layout.push(`${name}_range`);
            }
        }

        this._uniformLayout = layout;
        if (this._uniformLayout.length === 0) {
            // WebGPU does not allow empty uniform buffers; keep a dummy entry.
            this._uniformLayout.push("dummy");
        }
        this._uniformOffsets = new Map(layout.map((name, i) => [name, i * 4]));
        this._uniformValues = new Float32Array(layout.length * 4);

        for (const [name, channel] of Object.entries(this._channels)) {
            if (this._isValue(channel)) {
                this._setUniformValue(name, channel.value);
            }
            if (this._isSeries(channel) && channel.scale?.type === "linear") {
                this._setUniformVec2(
                    `${name}_domain`,
                    channel.scale.domain ?? [0, 1]
                );
                this._setUniformVec2(
                    `${name}_range`,
                    channel.scale.range ?? [0, 1]
                );
            }
            if (this._isValue(channel) && channel.scale?.type === "linear") {
                this._setUniformVec2(
                    `${name}_domain`,
                    channel.scale.domain ?? [0, 1]
                );
                this._setUniformVec2(
                    `${name}_range`,
                    channel.scale.range ?? [0, 1]
                );
            }
        }
    }

    /**
     * @param {string} name
     * @param {number|number[]} value
     * @returns {void}
     */
    _setUniformValue(name, value) {
        const offset = this._uniformOffsets.get(name);
        if (offset === undefined) {
            return;
        }

        // Everything is stored as vec4<f32> slots for simplicity.
        if (Array.isArray(value)) {
            for (let i = 0; i < 4; i++) {
                this._uniformValues[offset + i] = value[i] ?? 0;
            }
        } else {
            this._uniformValues[offset] = value ?? 0;
            this._uniformValues[offset + 1] = 0;
            this._uniformValues[offset + 2] = 0;
            this._uniformValues[offset + 3] = 0;
        }
    }

    /**
     * @param {string} name
     * @param {[number, number]} value
     * @returns {void}
     */
    _setUniformVec2(name, value) {
        const offset = this._uniformOffsets.get(name);
        if (offset === undefined) {
            return;
        }
        this._uniformValues[offset] = value?.[0] ?? 0;
        this._uniformValues[offset + 1] = value?.[1] ?? 1;
        this._uniformValues[offset + 2] = 0;
        this._uniformValues[offset + 3] = 0;
    }

    /**
     * @returns {void}
     */
    _writeUniforms() {
        if (this._uniformValues.byteLength === 0) {
            return;
        }
        // Single uniform buffer update keeps GPU bindings stable.
        this.device.queue.writeBuffer(
            this._uniformBuffer,
            0,
            this._uniformValues
        );
    }

    /**
     * @returns {ShaderBuildResult}
     */
    _buildShader() {
        return buildMarkShader({
            channels: this._channels,
            uniformLayout: this._uniformLayout,
            shaderBody: this.shaderBody,
        });
    }

    /**
     * @param {GPURenderPassEncoder} pass
     */
    draw(pass) {
        pass.setPipeline(this._pipeline);
        pass.setBindGroup(0, this.renderer._globalBindGroup);
        pass.setBindGroup(1, this._bindGroup);
        pass.draw(6, this.count, 0, 0);
    }

    destroy() {
        // TODO: Track and destroy buffers once GPUBuffer.destroy is supported in all targets.
    }

    /**
     * @param {Record<string, ChannelConfig>} [config]
     * @returns {Record<string, ChannelConfig>}
     */
    _normalizeChannels(config) {
        /** @type {Record<string, ChannelConfig>} */
        const channels = {};
        for (const name of this.channelOrder) {
            const merged = {
                ...(this.defaultChannelConfigs[name] ?? {}),
                ...(config?.[name] ?? {}),
            };
            if (!merged.components) {
                merged.components = 1;
            }
            // Provide sensible defaults to avoid missing channels at render time.
            // Defaults only apply when the channel is value-based.
            if (!this._isSeries(merged) && merged.value === undefined) {
                if (merged.default !== undefined) {
                    merged.value = merged.default;
                } else if (this.defaultValues[name] !== undefined) {
                    merged.value = this.defaultValues[name];
                }
            }
            this._validateChannel(name, merged);
            channels[name] = merged;
        }
        return channels;
    }

    /**
     * @param {string} name
     * @param {ChannelConfig} channel
     */
    _validateChannel(name, channel) {
        if (!this.channelOrder.includes(name)) {
            throw new Error(`Unknown channel: ${name}`);
        }
        if (this._isSeries(channel)) {
            if (!channel.data) {
                throw new Error(`Missing data for channel "${name}"`);
            }
            if (!channel.type) {
                throw new Error(`Missing type for channel "${name}"`);
            }
        }
        if (this._isSeries(channel) && this._isValue(channel)) {
            throw new Error(
                `Channel "${name}" must not specify both data and value.`
            );
        }
        if (channel.components && ![1, 2, 4].includes(channel.components)) {
            throw new Error(`Invalid component count for "${name}"`);
        }
        if (
            channel.components &&
            channel.components > 1 &&
            channel.type &&
            channel.type !== "f32"
        ) {
            throw new Error(
                `Only f32 vectors are supported for "${name}" right now.`
            );
        }
    }

    /**
     * @param {ChannelConfig} channel
     * @returns {boolean}
     */
    _isSeries(channel) {
        return channel.data != null;
    }

    /**
     * @param {ChannelConfig} channel
     * @returns {boolean}
     */
    _isValue(channel) {
        return channel.value != null || channel.default != null;
    }
}
