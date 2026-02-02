import { describe, expect, it } from "vitest";
import Collector from "../data/collector.js";
import DataSource from "../data/sources/dataSource.js";
import { buildReadinessRequest, isSubtreeReady } from "./dataReadiness.js";
import UnitView from "./unitView.js";

/**
 * @param {{ready?: boolean, completed?: boolean}} [options]
 */
function createReadySubtree(options = {}) {
    const ready = options.ready ?? true;
    const completed = options.completed ?? true;

    // Non-obvious: use UnitView's prototype so instanceof checks pass without full init.
    const unitView = Object.create(UnitView.prototype);
    unitView.isConfiguredVisible = () => true;

    const dataSource = new (class extends DataSource {
        isDataReadyForDomain() {
            return ready;
        }
    })(/** @type {import("./view.js").default} */ (/** @type {any} */ ({})));

    const collector = new Collector();
    collector.parent = dataSource;
    collector.completed = completed;

    unitView.flowHandle = { collector };

    return {
        subtreeRoot: /** @type {import("./view.js").default} */ (
            /** @type {any} */ ({
                getDescendants: () => [unitView],
            })
        ),
    };
}

describe("dataReadiness", () => {
    it("builds readiness requests from scale domains", () => {
        const view = /** @type {import("./view.js").default} */ (
            /** @type {any} */ ({
                /**
                 * @param {import("../spec/channel.js").PrimaryPositionalChannel} channel
                 */
                getScaleResolution: (channel) =>
                    channel === "x" ? { getDomain: () => [0, 10] } : undefined,
            })
        );

        expect(buildReadinessRequest(view, ["x"])).toEqual({ x: [0, 10] });
    });

    it("reports readiness when collectors are complete and data is ready", () => {
        const { subtreeRoot } = createReadySubtree();

        expect(isSubtreeReady(subtreeRoot, { x: [0, 10] })).toBe(true);
    });

    it("returns false when collectors are not complete", () => {
        const { subtreeRoot } = createReadySubtree({ completed: false });

        expect(isSubtreeReady(subtreeRoot, { x: [0, 10] })).toBe(false);
    });

    it("returns false when data is not ready for the requested domain", () => {
        const { subtreeRoot } = createReadySubtree({ ready: false });

        expect(isSubtreeReady(subtreeRoot, { x: [0, 10] })).toBe(false);
    });
});
