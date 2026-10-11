import { describe, expect, it } from "vitest";
import { DEFAULT_ADMIN_PATH, safeNext } from "@/lib/admin/safeNext";

describe("safeNext", () => {
  it("keeps admin paths", () => {
    expect(safeNext("/admin/vaises/datos")).toBe("/admin/vaises/datos");
  });

  it.each([undefined, "", "https://evil.example", "//evil.example", "/\\evil.example", "/other", ["/admin/x"]])(
    "falls back for %s",
    (value) => {
      expect(safeNext(value)).toBe(DEFAULT_ADMIN_PATH);
    },
  );
});
