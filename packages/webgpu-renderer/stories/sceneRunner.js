const TAG_NAME = "webgpu-scene";

class WebgpuSceneElement extends HTMLElement {
    constructor() {
        super();
        this._canvas = null;
        this._runScene = null;
        this._args = {};
        this._cleanup = null;
        this._update = null;
        this._generation = 0;
        this._pending = Promise.resolve();
    }

    connectedCallback() {
        if (!navigator.gpu) {
            this.textContent = "WebGPU is not available in this browser.";
            return;
        }
        this.style.display = "block";
        this.style.width = "100%";
        this.style.height = "100vh";
        if (!this._canvas) {
            const canvas = document.createElement("canvas");
            canvas.style.width = "100%";
            canvas.style.height = "100%";
            canvas.style.display = "block";
            this._canvas = canvas;
            this.append(canvas);
        }
        this._startScene();
    }

    disconnectedCallback() {
        this._teardownScene();
    }

    set runScene(fn) {
        this._runScene = fn;
        this._startScene();
    }

    set args(value) {
        this._args = value ?? {};
        if (this._update) {
            this._update(this._args);
        } else {
            this._startScene();
        }
    }

    async _startScene() {
        if (!this.isConnected || !this._canvas || !this._runScene) {
            return;
        }
        this._teardownScene();
        const generation = this._generation;
        // A replacement must wait until the previous scene releases this canvas.
        await this._pending;
        if (generation !== this._generation) return;

        const pending = this._runScene(this._canvas, this._args);
        this._pending = pending.then(
            () => {},
            () => {}
        );
        const result = await pending;
        const cleanup = typeof result === "function" ? result : result?.cleanup;
        if (generation !== this._generation) {
            cleanup?.();
            return;
        }
        this._cleanup = cleanup ?? null;
        this._update =
            typeof result === "function" ? null : (result?.update ?? null);
    }

    _teardownScene() {
        this._generation++;
        if (this._cleanup) {
            this._cleanup();
        }
        this._cleanup = null;
        this._update = null;
    }
}

if (!customElements.get(TAG_NAME)) {
    customElements.define(TAG_NAME, WebgpuSceneElement);
}

/**
 * @param {(canvas: HTMLCanvasElement, args?: Record<string, unknown>) => Promise<unknown>} runScene
 * @param {Record<string, unknown>} args
 * @returns {HTMLElement}
 */
export function renderScene(runScene, args) {
    const element = document.createElement(TAG_NAME);
    element.runScene = runScene;
    element.args = args;
    return element;
}
