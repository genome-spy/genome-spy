/**
 * Bounds-checked, zero-copy reader for big-endian OpenType data.
 * Adapted from text-shaper; see ../NOTICE.md.
 */
export class Reader {
    /**
     * @param {ArrayBuffer | ArrayBufferView | DataView} source
     * @param {number} [offset]
     * @param {number} [length]
     */
    constructor(source, offset = 0, length) {
        if (source instanceof DataView) {
            this._view = source;
        } else if (source instanceof ArrayBuffer) {
            this._view = new DataView(source);
        } else if (ArrayBuffer.isView(source)) {
            this._view = new DataView(
                source.buffer,
                source.byteOffset,
                source.byteLength
            );
        } else {
            throw new TypeError(
                "OpenType data must be an ArrayBuffer or view."
            );
        }
        const resolvedLength = length ?? this._view.byteLength - offset;
        if (
            !Number.isInteger(offset) ||
            !Number.isInteger(resolvedLength) ||
            offset < 0 ||
            resolvedLength < 0 ||
            offset + resolvedLength > this._view.byteLength
        ) {
            throw new RangeError(
                "OpenType reader range is outside the buffer."
            );
        }
        this._start = offset;
        this._length = resolvedLength;
        this._position = 0;
    }

    get offset() {
        return this._position;
    }

    get length() {
        return this._length;
    }

    get remaining() {
        return this._length - this._position;
    }

    /** @param {number} byteLength */
    _ensure(byteLength) {
        if (
            !Number.isInteger(byteLength) ||
            byteLength < 0 ||
            this._position + byteLength > this._length
        ) {
            throw new RangeError("Unexpected end of OpenType data.");
        }
    }

    /** @param {number} offset */
    seek(offset) {
        if (!Number.isInteger(offset) || offset < 0 || offset > this._length) {
            throw new RangeError("OpenType seek is outside the table.");
        }
        this._position = offset;
    }

    /** @param {number} byteLength */
    skip(byteLength) {
        this._ensure(byteLength);
        this._position += byteLength;
    }

    /** @param {number} offset @param {number} length */
    slice(offset, length) {
        if (
            !Number.isInteger(offset) ||
            !Number.isInteger(length) ||
            offset < 0 ||
            length < 0 ||
            offset + length > this._length
        ) {
            throw new RangeError("OpenType table range is outside the buffer.");
        }
        return new Reader(this._view, this._start + offset, length);
    }

    uint8() {
        this._ensure(1);
        return this._view.getUint8(this._start + this._position++);
    }

    int8() {
        this._ensure(1);
        return this._view.getInt8(this._start + this._position++);
    }

    uint16() {
        this._ensure(2);
        const value = this._view.getUint16(this._start + this._position, false);
        this._position += 2;
        return value;
    }

    int16() {
        this._ensure(2);
        const value = this._view.getInt16(this._start + this._position, false);
        this._position += 2;
        return value;
    }

    uint32() {
        this._ensure(4);
        const value = this._view.getUint32(this._start + this._position, false);
        this._position += 4;
        return value;
    }

    tag() {
        return String.fromCharCode(
            this.uint8(),
            this.uint8(),
            this.uint8(),
            this.uint8()
        );
    }

    /** @param {number} count */
    bytes(count) {
        this._ensure(count);
        const bytes = new Uint8Array(
            this._view.buffer,
            this._view.byteOffset + this._start + this._position,
            count
        );
        this._position += count;
        return bytes;
    }
}
