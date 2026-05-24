import { describe, expect, test } from "bun:test";

function sum(a: number, b: number) {
  return a + b;
}

describe("sum", () => {
  test("adds two positive numbers", () => {
    expect(sum(2, 3)).toBe(5);
  });
});
