import { describe, expect, it } from "vitest";
import { addDaysIso, bookingWindowEndIso, monthRangeIso } from "../bookingWindow";

describe("bookingWindowEndIso", () => {
  it("is the same month and day three years later", () => {
    expect(bookingWindowEndIso("2026-10-11")).toBe("2029-10-11");
  });

  it("maps Feb 29 to Feb 28, like the backend", () => {
    expect(bookingWindowEndIso("2028-02-29")).toBe("2031-02-28");
  });
});

describe("addDaysIso", () => {
  it("counts calendar days across month and year ends", () => {
    expect(addDaysIso("2026-10-11", 400)).toBe("2027-11-15");
  });
});

describe("monthRangeIso", () => {
  it("spans the first to the last day of the month", () => {
    expect(monthRangeIso({ year: 2028, month: 1 })).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
});
