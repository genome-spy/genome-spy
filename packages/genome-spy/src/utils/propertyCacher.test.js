import { getCachedOrCall, invalidate, invalidateAll } from "./propertyCacher";

class TestClass {
    constructor() {
        /** @type {number} */
        this._x;
        /** @type {number} */
        this._y;

        this._xCalls = 0;
        this._yCalls = 0;

        this.resetAll();
    }

    get x() {
        return getCachedOrCall(this, "x", () => {
            this._xCalls++;
            return this._x;
        });
    }

    set x(x) {
        this._x = x;
        invalidate(this, "x");
    }

    get y() {
        return getCachedOrCall(this, "y", () => {
            this._yCalls++;
            return this._y;
        });
    }

    set y(y) {
        this._y = y;
        invalidate(this, "y");
    }

    resetAll() {
        this._x = 10;
        this._y = 20;
        invalidateAll(this);
    }
}

test("Initial cached get returns correct values and calls callable only once", () => {
    const instance = new TestClass();

    expect(instance._xCalls).toEqual(0);
    expect(instance.x).toEqual(10);
    expect(instance._xCalls).toEqual(1);
    expect(instance.x).toEqual(10);
    expect(instance._xCalls).toEqual(1);
});

test("Invalidate invalidates", () => {
    const instance = new TestClass();

    expect(instance._xCalls).toEqual(0);
    expect(instance.x).toEqual(10);
    expect(instance._xCalls).toEqual(1);

    instance.x = 123;
    expect(instance._xCalls).toEqual(1);

    expect(instance.x).toEqual(123);
    expect(instance._xCalls).toEqual(2);
});

test("InvalidateAll invalidates everything", () => {
    const instance = new TestClass();

    instance.x = 123;
    instance.y = 321;

    expect(instance.x).toEqual(123);
    expect(instance.y).toEqual(321);

    instance.resetAll();

    expect(instance.x).toEqual(10);
    expect(instance.y).toEqual(20);
});
