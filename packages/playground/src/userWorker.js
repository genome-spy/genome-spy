// @ts-ignore
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";

// @ts-ignore
self.MonacoEnvironment = {
    /** @type {(_: any, label: string) => any} */
    getWorker(_, label) {
        if (label === "json") {
            return new JsonWorker();
        }
        throw new Error("Unsupported language: " + label);
    },
};
