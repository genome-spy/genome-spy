import { embed, icon } from "../../dist/src/index.js";
import type { RootSpec } from "../../dist/src/spec/root.js";

// Compile the emitted public graph as a strict consumer, without workspace globals.
export async function inspect(element: HTMLElement, spec: RootSpec) {
    const api = await embed(element, spec);
    const selection = api.views.get("root").params.getSelection("selected");
    if (selection.type === "point") selection.setValue([["geneA"]]);
    const result = api.views.get("root").readData({ limit: 10 });
    return { result, icon };
}
