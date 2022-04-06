import { expect, test } from "vitest";
import ReservationMap from "./reservationMap";

test("ReservationMap works correctly", () => {
    const m = new ReservationMap(20);

    expect(m.reserve(0, 3)).toBeTruthy();
    expect(m.reserve(15, 17)).toBeTruthy();
    expect(m.reserve(5, 11)).toBeTruthy();
    expect(m.reserve(19, 22)).toBeTruthy();
    expect(m.reserve(23, 26)).toBeTruthy();
    expect(m.reserve(12, 13)).toBeTruthy();
    expect(m.reserve(13, 14)).toBeTruthy();
    expect(m.reserve(4, 5)).toBeTruthy();

    expect(m.reserve(6, 8)).toBeFalsy();
    expect(m.reserve(10, 13)).toBeFalsy();
    expect(m.reserve(-2, 1)).toBeFalsy();
    expect(m.reserve(25, 28)).toBeFalsy();
});
