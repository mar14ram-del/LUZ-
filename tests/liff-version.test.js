// 2026-11-25：@line/liff 2.31.0 被 LINE 停用，客人按「用 LINE 登入」後看到 400 Bad Request。
// 鎖定的版本必須 >= 2.31.1。
import { describe, it, expect } from "vitest";
import fs from "node:fs";

const MIN = [2, 31, 1];
function atLeast(v) {
  const a = v.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== MIN[i]) return a[i] > MIN[i];
  return true;
}

describe("LINE 登入套件版本", () => {
  it("package-lock 鎖定的 @line/liff 不低於 2.31.1", () => {
    const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
    const v = lock.packages["node_modules/@line/liff"].version;
    expect(atLeast(v)).toBe(true);
  });
});
