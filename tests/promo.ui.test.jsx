// 優惠券頁、顧客券區塊的畫面冒煙測試：能打開、能新增一張券並存檔
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { vi } from "vitest";

const saved = {};
vi.mock("../src/storage", () => ({
  loadKey: vi.fn(async (k, fb) => (k === "customers:list" ? [{ id: "amy", name: "Amy", birthday: "1990-" + String(new Date().getMonth() + 1).padStart(2, "0") + "-01", lineUserId: "U1" }] : fb)),
  saveKey: vi.fn(async (k, v) => { saved[k] = v; return true; }),
}));
vi.mock("../src/coupon-store", () => ({
  loadGrants: vi.fn(async () => []), issueGrants: vi.fn(async () => []),
  sendLine: vi.fn(async () => ({ ok: true })), markNotified: vi.fn(async () => {}),
}));
import PromoApp from "../src/promo";

afterEach(cleanup);

test("新增一張生日券並存檔，名單出現符合的客人", async () => {
  render(<PromoApp />);
  fireEvent.click(await screen.findByText("新增優惠券"));
  fireEvent.change(screen.getByPlaceholderText("例如：生日快樂折 200"), { target: { value: "生日禮" } });
  fireEvent.click(screen.getByText("生日當月"));
  fireEvent.click(screen.getByText("儲存"));
  await waitFor(() => expect(saved["promo:coupons"][0]).toMatchObject({ name: "生日禮", trigger: { kind: "birthday" } }));
  fireEvent.click(screen.getByText("名單"));
  expect(await screen.findByText(/1<\/b>|位，其中 1 位已連結 LINE/)).toBeTruthy();
});
