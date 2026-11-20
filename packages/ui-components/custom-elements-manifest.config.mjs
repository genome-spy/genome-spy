export default {
    globs: ["src/**/*.js"],
    exclude: ["src/**/*.test.js"],
    litelement: true,
    outdir: "dist",
    packagejson: false,
    plugins: [
        {
            name: "public-lit-api",
            packageLinkPhase({ customElementsManifest }) {
                for (const module of customElementsManifest.modules) {
                    for (const declaration of module.declarations ?? []) {
                        if (!declaration.customElement) {
                            continue;
                        }

                        // The analyzer includes some Lit state fields as attributes.
                        const privateMembers = new Set(
                            (declaration.members ?? [])
                                .filter(
                                    ({ name, privacy }) =>
                                        privacy === "private" ||
                                        name.startsWith("_")
                                )
                                .map(({ name }) => name)
                        );
                        declaration.members = declaration.members?.filter(
                            ({ name }) => !privateMembers.has(name)
                        );
                        for (const member of declaration.members ?? []) {
                            if (member.attribute) {
                                member.attribute =
                                    member.attribute.toLowerCase();
                            }
                        }
                        declaration.attributes = declaration.attributes
                            ?.filter(
                                ({ fieldName }) =>
                                    !privateMembers.has(fieldName)
                            )
                            .map((attr) => ({
                                ...attr,
                                name: attr.name.toLowerCase(),
                            }));

                        // Event dispatch analysis can mistake variables for event names.
                        declaration.events = declaration.events?.filter(
                            ({ name, description }) => name && description
                        );
                    }
                }
            },
        },
    ],
};
