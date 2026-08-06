// Small deterministic, uncompressed Parquet file with two rows.
export const parquetFixture = Uint8Array.from(
    atob(
        "UEFSMRUAFSQVJCwVBBUAFQYVBgAAAgAAAAQBAgAAAFMxAgAAAFMyFQAVHBUc" +
            "LBUEFQAVBhUGAAACAAAABAEKAAAAFAAAABUCGTw1ABgNZHVja2RiX3NjaGVt" +
            "YRUEABUMJQIYBnNhbXBsZSUAABUCJQIYBXZhbHVlJSIAFgQZHBksJgAcFQwZ" +
            "FQAZGAZzYW1wbGUVABYEFkYWRiYIPBgCUzIYAlMxFgAoAlMyGAJTMRERAAAA" +
            "JgAcFQIZFQAZGAV2YWx1ZRUAFgQWPhY+Jk48GAQUAAAAGAQKAAAAFgAoBBQA" +
            "AAAYBAoAAAAREQAAABaEARYEJggWhAEAKChEdWNrREIgdmVyc2lvbiB2MS41" +
            "LjAgKGJ1aWxkIDNhMzk2N2FhODEpGSwcAAAcAAAA5gAAAFBBUjE="
    ),
    (character) => character.charCodeAt(0)
);

export const parquetExpectedRows = [
    { sample: "S1", value: 10 },
    { sample: "S2", value: 20 },
];
