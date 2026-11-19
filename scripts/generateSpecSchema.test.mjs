import { expect, test } from "vitest";
import { deduplicateSpecSchema } from "./generateSpecSchema.mjs";

const draft7 = "http://json-schema.org/draft-07/schema#";

test("shares identical subschemas and preserves named references and annotation values", () => {
    // Although these keys resemble schema keywords, they describe example data.
    const example = {
        $id: "https://example.com/example.json",
        $ref: "#/properties/data",
        properties: { shared: { type: "string" } },
    };
    const property = {
        $ref: "#/definitions/Named",
        description: "Shared documentation for a reusable property. ".repeat(4),
        examples: [example],
        default: example,
    };
    const other = { ...property, description: "Different documentation." };
    const named = { type: "object" };
    const original = {
        $schema: draft7,
        definitions: { Named: named },
        properties: {
            first: property,
            second: { ...property },
            other,
        },
    };

    const schema = deduplicateSpecSchema(original);
    const ref = schema.properties.first.$ref;

    expect(ref).toMatch(/^#\/definitions\/shared-\d+$/);
    expect(schema.properties.second).toEqual({ $ref: ref });
    expect(schema.definitions[ref.slice("#/definitions/".length)]).toEqual(
        property
    );
    expect(schema.properties.other).toEqual(other);
    expect(schema.definitions.Named).toEqual(named);
    expect(deduplicateSpecSchema(original)).toEqual(schema);
});

test.each([
    { $id: "https://example.com/scoped.json" },
    { $ref: "#/definitions/Root%2Fproperties%2Ffirst" },
])("keeps schema locations when a nested node has %j", (scoped) => {
    const repeated = {
        type: "string",
        description:
            "Repeated documentation that can otherwise be shared. ".repeat(4),
    };
    const original = {
        $schema: draft7,
        definitions: {
            Root: {
                properties: {
                    first: repeated,
                    second: repeated,
                    nested: { items: [false, scoped] },
                },
            },
        },
    };

    expect(deduplicateSpecSchema(original)).toEqual(original);
});
