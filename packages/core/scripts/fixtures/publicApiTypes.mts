import { embed, icon } from "../../dist/src/index.js";
import {
    createViewQuery,
    type ViewAnnotations,
} from "../../dist/src/viewQuery.js";
import type { RootSpec } from "../../dist/src/spec/root.js";

// Compile the emitted public graph as a strict consumer, without workspace globals.
export async function inspect(element: HTMLElement, spec: RootSpec) {
    const api = await embed(element, spec);
    const query = createViewQuery(api.views);
    const annotations: ViewAnnotations = query.annotations;
    const result = await query.queryData("root", {
        channels: ["x"],
        limit: 10,
    });
    annotations.dispose();
    return { result, icon };
}
