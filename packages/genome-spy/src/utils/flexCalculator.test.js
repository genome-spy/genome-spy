import FlexLayout from "./flexCalculator";

test("Absolute sizes", () => {
    const layout = new FlexLayout();
    const a = layout.append(10);
    const b = layout.append(30);
    const c = layout.append(20);
    layout.setContainerSize(100);

    expect(a.getPixels()).toEqual([0, 10]);
    expect(b.getPixels()).toEqual([10, 40]);
    expect(c.getPixels()).toEqual([40, 60]);
});

test("Relative sizes", () => {
    const layout = new FlexLayout();
    const a = layout.append("10%");
    const b = layout.append("20%");
    const c = layout.append("70%");
    layout.setContainerSize(200);

    expect(a.getPixels()).toEqual([0, 20]);
    expect(b.getPixels()).toEqual([20, 60]);
    expect(c.getPixels()).toEqual([60, 200]);
});

test("Both absolute and relative sizes", () => {
    const layout = new FlexLayout();
    const a = layout.append("100px");
    const b = layout.append("10%");
    const c = layout.append({ value: 90, unit: "%" });
    const d = layout.append({ value: 200, unit: "px" });
    layout.setContainerSize(1100);

    expect(a.getPixels()).toEqual([0, 100]);
    expect(b.getPixels()).toEqual([100, 180]);
    expect(c.getPixels()).toEqual([180, 900]);
    expect(d.getPixels()).toEqual([900, 1100]);
});

test("Normalized calculations", () => {
    const layout = new FlexLayout();
    const a = layout.append(10);
    const b = layout.append(30);
    const c = layout.append(20);
    layout.setContainerSize(100);

    expect(a.getNormalized()).toEqual([0, 0.1]);
    expect(b.getNormalized()).toEqual([0.1, 0.4]);
    expect(c.getNormalized()).toEqual([0.4, 0.6]);
});
