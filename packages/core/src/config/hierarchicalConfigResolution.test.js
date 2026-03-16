import { describe, expect, test } from "vitest";
import { createTestViewContext } from "../view/testUtils.js";

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
        const context = createTestViewContext({ wrapRoot: false });
        const root = await context.createOrImportView(
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
            null,
            null,
            "root"
        );

        expect(findByName(root, "childInherit").getConfig().mark.color).toBe(
            "blue"
        );
        expect(findByName(root, "childOverride").getConfig().mark.color).toBe(
            "green"
        );
    });
});
