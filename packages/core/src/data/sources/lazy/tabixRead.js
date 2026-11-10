// The prefix reader shares the Tabix import so it is loaded before header
// inspection. Named imports keep unused BGZF worker code out of the UMD bundle.
export { TabixIndexedFile } from "@gmod/tabix";
export { unzip } from "@gmod/bgzf-filehandle";
