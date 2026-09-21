import { describe, expect, test, vi } from "vitest";
import {
    createSchemaRequestService,
    usesBundledCoreSchema,
} from "./schemaRequestService.js";

describe("Playground schema requests", () => {
    test.each([
        "https://genomespy.app/schema/core/v0.json",
        "https://genomespy.app/schema/core/v0.88.json",
        "https://genomespy.app/schema/core/v0.88.1.json",
        "https://unpkg.com/@genome-spy/core/dist/schema.json",
        "https://cdn.jsdelivr.net/npm/@genome-spy/core/dist/schema.json",
    ])("uses the bundled schema for %s", (uri) => {
        expect(usesBundledCoreSchema(uri, "0.89.0")).toBe(true);
    });

    test.each([
        "https://genomespy.app/schema/core/v1.json",
        "https://genomespy.app/schema/app/v0.json",
        "https://example.com/schema.json",
    ])("does not substitute the bundled schema for %s", (uri) => {
        expect(usesBundledCoreSchema(uri, "0.89.0")).toBe(false);
    });

    test("loads other schema versions over the network", async () => {
        const fetchSchema = vi.fn().mockResolvedValue({
            ok: true,
            text: () => Promise.resolve('{"title":"Core v1"}'),
        });
        const requestSchema = createSchemaRequestService(
            { title: "development" },
            "0.89.0",
            fetchSchema
        );

        await expect(
            requestSchema("https://genomespy.app/schema/core/v0.json")
        ).resolves.toBe('{"title":"development"}');
        await expect(
            requestSchema("https://genomespy.app/schema/core/v1.json")
        ).resolves.toBe('{"title":"Core v1"}');
        expect(fetchSchema).toHaveBeenCalledOnce();
    });

    test("reports failed remote schema requests", async () => {
        const requestSchema = createSchemaRequestService(
            {},
            "0.89.0",
            vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
                statusText: "Not Found",
            })
        );

        await expect(
            requestSchema("https://genomespy.app/schema/core/v1.json")
        ).rejects.toThrow("404 Not Found");
    });
});
