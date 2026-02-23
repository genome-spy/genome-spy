import KeyboardZoomMotion from "../keyboardZoomMotion.js";
import { markZoomActivity } from "../zoom.js";
import { getKeyboardZoomTarget } from "./zoomNavigationUtils.js";

/**
 * Handles WASD keyboard navigation for the root grid view.
 */
export default class KeyboardZoomController {
    /** @type {import("../../types/viewContext.js").default} */
    #context;

    /** @type {import("../view.js").default} */
    #viewRoot;

    #zoomAnchorX = 0.5;

    #keyboardZoomMotion = new KeyboardZoomMotion();

    #keyboardNavigationActive = false;

    #keyboardNavigationTimestamp = 0;

    #keyboardNavigationStep = (/** @type {number} */ timestamp) => {
        if (!this.#keyboardNavigationActive) {
            return;
        }

        const resolution = getKeyboardZoomTarget(this.#viewRoot);
        if (!resolution) {
            this.#keyboardZoomMotion.reset();
            this.#keyboardNavigationActive = false;
            this.#keyboardNavigationTimestamp = 0;
            return;
        }

        const dtMs = Math.max(0, timestamp - this.#keyboardNavigationTimestamp);
        this.#keyboardNavigationTimestamp = timestamp;

        const motion = this.#keyboardZoomMotion.step(dtMs);

        if (motion.panDelta !== 0 || motion.zoomDelta !== 0) {
            const changed = resolution.zoom(
                2 ** motion.zoomDelta,
                this.#zoomAnchorX,
                motion.panDelta
            );
            if (changed) {
                markZoomActivity();
                this.#context.animator.requestRender();
            }
        }

        if (motion.active) {
            this.#context.animator.requestTransition(
                this.#keyboardNavigationStep
            );
        } else {
            this.#keyboardNavigationActive = false;
            this.#keyboardNavigationTimestamp = 0;
        }
    };

    /**
     * @param {object} params
     * @param {import("../../types/viewContext.js").default} params.context
     * @param {import("../view.js").default} params.viewRoot
     */
    constructor({ context, viewRoot }) {
        this.#context = context;
        this.#viewRoot = viewRoot;
        this.#setupKeyboardNavigation();
    }

    /**
     * @param {import("./gridChild.js").default | undefined} pointedChild
     * @param {import("../../utils/interactionEvent.js").default} event
     */
    handlePointerEvent(pointedChild, event) {
        if (!pointedChild) {
            return;
        } else {
            const viewWithAnchor =
                /** @type {{getKeyboardZoomAnchorX?: (point: {x: number, y: number}) => number | undefined}} */ (
                    pointedChild.view
                );

            if (typeof viewWithAnchor.getKeyboardZoomAnchorX === "function") {
                const anchor = viewWithAnchor.getKeyboardZoomAnchorX(
                    event.point
                );
                if (Number.isFinite(anchor)) {
                    this.#zoomAnchorX = Math.max(0, Math.min(1, anchor));
                }
            } else {
                const normalizedPoint = pointedChild.coords.normalizePoint(
                    event.point.x,
                    event.point.y
                );
                this.#zoomAnchorX = normalizedPoint.x;
            }
        }
    }

    #setupKeyboardNavigation() {
        const addKeyboardListener = this.#context.addKeyboardListener;
        if (typeof addKeyboardListener !== "function") {
            return;
        }

        addKeyboardListener("keydown", (event) => {
            if (shouldIgnoreKeyboardNavigation(event)) {
                return;
            }

            if (!this.#keyboardZoomMotion.isNavigationKey(event.code)) {
                return;
            }

            const resolution = getKeyboardZoomTarget(this.#viewRoot);
            if (!resolution) {
                return;
            }

            const changed = this.#keyboardZoomMotion.handleKeyDown(event.code);
            if (!changed) {
                return;
            }

            event.preventDefault();
            this.#activateKeyboardNavigation();
        });

        addKeyboardListener("keyup", (event) => {
            if (!this.#keyboardZoomMotion.isNavigationKey(event.code)) {
                return;
            }

            const changed = this.#keyboardZoomMotion.handleKeyUp(event.code);
            if (!changed) {
                return;
            }

            const resolution = getKeyboardZoomTarget(this.#viewRoot);
            if (!resolution) {
                return;
            }

            event.preventDefault();
            this.#activateKeyboardNavigation();
        });
    }

    #activateKeyboardNavigation() {
        if (this.#keyboardNavigationActive) {
            return;
        }

        this.#keyboardNavigationActive = true;
        this.#keyboardNavigationTimestamp = performance.now();
        this.#context.animator.requestTransition(this.#keyboardNavigationStep);
    }
}

/**
 * @param {KeyboardEvent} event
 */
function shouldIgnoreKeyboardNavigation(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) {
        return true;
    }

    if (isEditableTarget(event.target)) {
        return true;
    }

    return false;
}

/**
 * @param {EventTarget | null} target
 */
function isEditableTarget(target) {
    if (!target || typeof target !== "object") {
        return false;
    }

    const candidate =
        /** @type {{isContentEditable?: boolean, nodeName?: string}} */ (
            target
        );

    if (candidate.isContentEditable) {
        return true;
    }

    if (typeof candidate.nodeName === "string") {
        const name = candidate.nodeName.toLowerCase();
        return name === "input" || name === "textarea" || name === "select";
    }

    return false;
}
