/**
 * Centralizes runtime-to-system invalidation requests.
 */
export default class InvalidationBridge {
    /**
     * @param {object} options
     * @param {() => void} [options.requestRender]
     * @param {() => void} [options.requestDataflow]
     * @param {() => void} [options.requestScale]
     */
    constructor(options = {}) {
        this.requestRender = options.requestRender ?? (() => undefined);
        this.requestDataflow = options.requestDataflow ?? (() => undefined);
        this.requestScale = options.requestScale ?? (() => undefined);
    }

    requestRender;

    requestDataflow;

    requestScale;
}
