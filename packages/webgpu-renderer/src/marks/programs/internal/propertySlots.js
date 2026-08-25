/**
 * Installs semantic property slots for a built-in mark program and initializes
 * them from the corresponding public config fields.
 *
 * Kept outside BaseProgram so marks without semantic properties do not bundle
 * the descriptor compiler.
 *
 * @param {import("./baseProgram.js").default} program
 * @param {Record<string, PropertySlotDefinition>} definitions
 */
export function initializePropertySlots(program, definitions) {
    const slots = program.getSlotHandles().properties;

    for (const [name, definition] of Object.entries(definitions)) {
        if (
            definition.uniform &&
            !program._uniformBufferState?.entries.has(definition.uniform)
        ) {
            throw new Error(
                `Property slot "${name}" targets unavailable uniform "${definition.uniform}".`
            );
        }
        if (!definition.uniform && !definition.set) {
            throw new Error(`Property slot "${name}" has no update target.`);
        }

        const setValue = (/** @type {any} */ value) => {
            if (definition.set) {
                definition.set(value);
            } else {
                const encoded = definition.encode
                    ? definition.encode(value)
                    : value;
                if (
                    typeof encoded != "number" &&
                    (!Array.isArray(encoded) ||
                        !encoded.every((entry) => typeof entry == "number"))
                ) {
                    throw new Error(
                        `Property "${name}" must encode to numeric uniform data.`
                    );
                }
                program._setUniformValue(definition.uniform, encoded);
            }
        };
        const configured = program._markConfig[name];
        setValue(
            configured !== undefined
                ? configured
                : definition.getDefault
                  ? definition.getDefault()
                  : definition.default
        );
        slots[name] = {
            set: (value) => {
                program._assertAlive();
                setValue(value);
                program._queueSlotUpdate(false);
            },
        };
    }
}

/**
 * @typedef {object} PropertySlotDefinition
 * @property {string} [uniform]
 * @property {any} [default]
 * @property {() => any} [getDefault]
 * @property {(value: any) => number | number[]} [encode]
 * @property {(value: any) => void} [set]
 */
