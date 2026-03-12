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
