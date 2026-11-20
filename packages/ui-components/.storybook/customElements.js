import { setCustomElementsManifest } from "@storybook/web-components-vite";
import manifest from "../dist/custom-elements.json";

export function loadCustomElementsManifest() {
    setCustomElementsManifest(manifest);
}
