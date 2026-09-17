import { gpuLabel } from "../utils/gpuLabel.js";

/**
 * Versioned final storage for an incrementally populated MSDF atlas.
 *
 * Growth replaces the texture, preserves its previous rectangle, and notifies
 * bind-group owners synchronously. The old texture remains alive until all
 * work submitted before the copy has completed.
 */
export class MsdfAtlasTexture {
    /**
     * @param {GPUDevice} device
     * @param {{ width: number, height: number, format?: "rgba16float", label?: string, growthFactor?: number }} options
     */
    constructor(device, options) {
        this.device = device;
        this.format = options.format ?? "rgba16float";
        this.label = options.label ?? "MSDF atlas";
        this.growthFactor = options.growthFactor ?? 2;
        if (!(this.growthFactor > 1) || !Number.isFinite(this.growthFactor)) {
            throw new Error(
                "MSDF atlas growth factor must be greater than one."
            );
        }
        this._validateDimensions(options.width, options.height);
        this.width = options.width;
        this.height = options.height;
        this.version = 1;
        this.texture = this._createTexture(this.width, this.height);
        this._destroyed = false;
        /** @type {Set<(atlas: MsdfAtlasTexture) => void>} */
        this._listeners = new Set();
        /** @type {Set<Promise<void>>} */
        this._retirements = new Set();
    }

    /** @param {number} width @param {number} height */
    _validateDimensions(width, height) {
        const limit = this.device.limits.maxTextureDimension2D;
        if (
            !Number.isInteger(width) ||
            !Number.isInteger(height) ||
            width <= 0 ||
            height <= 0 ||
            width > limit ||
            height > limit
        ) {
            throw new Error("Invalid MSDF atlas texture dimensions.");
        }
    }

    /** @param {number} width @param {number} height */
    _createTexture(width, height) {
        return this.device.createTexture({
            label: this.label,
            size: [width, height],
            format: this.format,
            usage:
                GPUTextureUsage.RENDER_ATTACHMENT |
                GPUTextureUsage.STORAGE_BINDING |
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_SRC |
                GPUTextureUsage.COPY_DST,
        });
    }

    /** @param {GPUTexture} texture */
    _retire(texture) {
        const retirement = this.device.queue.onSubmittedWorkDone().then(
            () => texture.destroy(),
            () => texture.destroy()
        );
        this._retirements.add(retirement);
        void retirement.finally(() => this._retirements.delete(retirement));
        return retirement;
    }

    /**
     * @param {(atlas: MsdfAtlasTexture) => void} listener
     * @returns {() => void}
     */
    subscribe(listener) {
        if (this._destroyed) {
            throw new Error("MSDF atlas texture has been destroyed.");
        }
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    /**
     * Grow to contain the requested dimensions. Returns true on replacement.
     *
     * @param {number} minimumWidth
     * @param {number} minimumHeight
     */
    grow(minimumWidth, minimumHeight) {
        if (this._destroyed) {
            throw new Error("MSDF atlas texture has been destroyed.");
        }
        this._validateDimensions(
            Math.max(this.width, minimumWidth),
            Math.max(this.height, minimumHeight)
        );
        if (minimumWidth <= this.width && minimumHeight <= this.height) {
            return false;
        }
        let width = this.width;
        let height = this.height;
        while (width < minimumWidth) {
            width = Math.min(
                this.device.limits.maxTextureDimension2D,
                Math.ceil(width * this.growthFactor)
            );
        }
        while (height < minimumHeight) {
            height = Math.min(
                this.device.limits.maxTextureDimension2D,
                Math.ceil(height * this.growthFactor)
            );
        }
        this._validateDimensions(width, height);

        const oldTexture = this.texture;
        const texture = this._createTexture(width, height);
        const encoder = this.device.createCommandEncoder({
            label: gpuLabel(this.label, "growth copy"),
        });
        encoder.copyTextureToTexture({ texture: oldTexture }, { texture }, [
            this.width,
            this.height,
        ]);
        this.device.queue.submit([encoder.finish()]);
        this.texture = texture;
        this.width = width;
        this.height = height;
        this.version++;
        this._retire(oldTexture);
        for (const listener of this._listeners) {
            listener(this);
        }
        return true;
    }

    destroy() {
        if (this._destroyed) {
            return;
        }
        this._destroyed = true;
        this._listeners.clear();
        this.texture.destroy();
    }
}
