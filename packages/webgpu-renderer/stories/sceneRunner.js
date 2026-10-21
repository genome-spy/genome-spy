import { html } from "lit";

/**
 * @typedef {Record<string, unknown>} SceneArgs
 * @typedef {{cleanup: () => void, update?: (args: SceneArgs) => void}} Scene
 * @typedef {(canvas: HTMLCanvasElement, args: SceneArgs) => Promise<(() => void) | Scene>} SceneRunner
 */

const TAG_NAME = "webgpu-scene";

class WebgpuSceneElement extends HTMLElement {
    constructor() {
        super();
        /** @type {HTMLCanvasElement | null} */
        this._canvas = null;

        /** @type {SceneRunner | null} */
        this._runScene = null;

        /** @type {SceneArgs} */
        this._args = {};

        /** @type {Scene | null} */
        this._scene = null;

        this._starting = false;
        this._version = 0;
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

    /** @param {SceneRunner} fn */
    set runScene(fn) {
        // Lit commits function-valued properties even when their identity is unchanged.
        if (fn === this._runScene) {
            return;
        }
        this._runScene = fn;
        this._teardownScene();
        this._startScene();
    }

    /** @param {SceneArgs} value */
    set args(value) {
        this._args = value ?? {};
        if (this._scene?.update) {
            this._scene.update(this._args);
        } else {
            this._startScene();
        }
    }

    async _startScene() {
        if (
            this._starting ||
            !this.isConnected ||
            !this._canvas ||
            !this._runScene
        ) {
            return;
        }
        this._teardownScene();
        const version = this._version;
        const args = this._args;
        this._starting = true;

        try {
            const result = await this._runScene(this._canvas, args);
            const scene =
                typeof result === "function" ? { cleanup: result } : result;

            if (version !== this._version) {
                // Removal or a runner change can happen before GPU setup finishes.
                scene.cleanup();
            } else {
                this._scene = scene;
                if (args !== this._args && scene.update) {
                    scene.update(this._args);
                }
            }
        } finally {
            this._starting = false;
            if (
                this.isConnected &&
                (version !== this._version ||
                    (args !== this._args && !this._scene?.update))
            ) {
                this._startScene();
            }
        }
    }

    _teardownScene() {
        this._version++;
        this._scene?.cleanup();
        this._scene = null;
    }
}

if (!customElements.get(TAG_NAME)) {
    customElements.define(TAG_NAME, WebgpuSceneElement);
}

/**
 * @param {SceneRunner} runScene
 * @param {SceneArgs} [args]
 * @returns {import("lit").TemplateResult}
 */
export function renderScene(runScene, args = {}) {
    return html`<webgpu-scene
        .runScene=${runScene}
        .args=${args}
    ></webgpu-scene>`;
}
