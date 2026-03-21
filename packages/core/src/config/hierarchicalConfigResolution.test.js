import { describe, expect, test } from "vitest";
import { createHeadlessViewHierarchy } from "../genomeSpy/headlessBootstrap.js";

/**
 * @param {import("../view/view.js").default} root
 * @param {string} name
 */
function findByName(root, name) {
    const view = /** @type {any} */ (root).findDescendantByName(name);
    if (!view) {
        throw new Error("View not found: " + name);
    }
    return view;
}

describe("hierarchical config resolution", () => {
    test("closest config scope dominates", async () => {
        const { view: root } = await createHeadlessViewHierarchy(
            {
                config: {
                    mark: { color: "red" },
                },
                layer: [
                    {
                        name: "parent",
                        config: {
                            mark: { color: "blue" },
                        },
                        layer: [
                            {
                                name: "childInherit",
                                mark: "point",
                            },
                            {
                                name: "childOverride",
                                config: {
                                    mark: { color: "green" },
                                },
                                mark: "point",
                            },
                        ],
                    },
                ],
            },
            {
                viewFactoryOptions: {
                    wrapRoot: false,
                },
            }
        );

        expect(findByName(root, "childInherit").getConfig().mark.color).toBe(
            "blue"
        );
        expect(findByName(root, "childOverride").getConfig().mark.color).toBe(
            "green"
        );
    });
});
