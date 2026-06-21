/**
 * Reference-counted suspension guard. Nested suspensions are supported and the
 * resume callback runs only when the outermost release happens.
 */
export default class Suspension {
    #count = 0;

    /** @type {() => void} */
    #onResume;

    /**
     * @param {() => void} [onResume]
     */
    constructor(onResume = () => undefined) {
        this.#onResume = onResume;
    }

    get active() {
        return this.#count > 0;
    }

    /**
     * @returns {() => void}
     */
    suspend() {
        this.#count += 1;
        let released = false;

        return () => {
            if (released) {
                return;
            }

            released = true;
            this.#count -= 1;
            if (this.#count == 0) {
                this.#onResume();
            }
        };
    }
}
