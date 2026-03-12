declare module "*.svg" {
    const content: string;
    export default content;
}

declare module "*.txt" {
    const content: string;
    export default content;
}

declare module "*.png" {
    const value: any;
    export default value;
}

declare module "*?raw" {
    const content: string;
    export default content;
}

declare module "@genome-spy/core/schema.json" {
    const schema: Record<string, any>;
    export default schema;
}
