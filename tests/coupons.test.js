// 優惠券規則：條件判斷、可用券、折抵
import {
  availableCoupons, planDiscount, applyCoupon, removeCoupon, meetsTrigger,
  eligibleCustomers, expiryFor, blankCoupon,
} from "../src/coupons";

const cp = (over) => ({ ...blankCoupon(), id: "c1", name: "測試券", ...over });
const tx = (customerId, date, amount = 800) => ({ id: date + customerId, customerId, date, type: "income", amount, category: "剪髮加洗髮" });
const amy = { id: "amy", name: "Amy", birthday: "1990-11-03" };

test("生日當月：11 月生日在 11 月可用、12 月不行；每年各一次", () => {
  const c = cp({ trigger: { kind: "birthday" } });
  expect(meetsTrigger(c, amy, [], "2026-11-24")).toBe(true);
  expect(meetsTrigger(c, amy, [], "2026-12-01")).toBe(false);
  const usedLastYear = [{ coupon_id: "c1", customer_id: "amy", used_at: "2025-11-10T10:00:00Z" }];
  expect(availableCoupons({ coupons: [c], grants: usedLastYear, customer: amy, transactions: [], date: "2026-11-24" })).toHaveLength(1);
  const usedThisYear = [{ coupon_id: "c1", customer_id: "amy", used_at: "2026-11-02T10:00:00Z" }];
  expect(availableCoupons({ coupons: [c], grants: usedThisYear, customer: amy, transactions: [], date: "2026-11-24" })).toHaveLength(0);
});

test("第一次消費後：今天第一次來的不算，之前來過才算", () => {
  const c = cp({ trigger: { kind: "firstVisit" } });
  expect(meetsTrigger(c, amy, [tx("amy", "2026-11-24")], "2026-11-24")).toBe(false);
  expect(meetsTrigger(c, amy, [tx("amy", "2026-10-01")], "2026-11-24")).toBe(true);
});

test("消費滿 N 次：同一天多筆算一次", () => {
  const c = cp({ trigger: { kind: "visits", count: 3 } });
  const t2 = [tx("amy", "2026-01-01"), tx("amy", "2026-01-01"), tx("amy", "2026-02-01")];
  expect(meetsTrigger(c, amy, t2, "2026-11-24")).toBe(false);
  expect(meetsTrigger(c, amy, [...t2, tx("amy", "2026-03-01")], "2026-11-24")).toBe(true);
});

test("超過 N 個月沒來：最後一次來店滿 N 個月才算", () => {
  const c = cp({ trigger: { kind: "dormant", months: 6 } });
  expect(meetsTrigger(c, amy, [tx("amy", "2026-05-25")], "2026-11-24")).toBe(false);
  expect(meetsTrigger(c, amy, [tx("amy", "2026-05-24")], "2026-11-24")).toBe(true);
  expect(meetsTrigger(c, amy, [], "2026-11-24")).toBe(false);
});

test("手動發的券：只有發給他的、沒用過、沒過期才出現；停用或過了活動期間不出現", () => {
  const c = cp({ trigger: { kind: "manual" } });
  const g = { id: "g1", coupon_id: "c1", customer_id: "amy", expires_on: "2026-11-30" };
  const args = { coupons: [c], customer: amy, transactions: [], date: "2026-11-24" };
  expect(availableCoupons({ ...args, grants: [] })).toHaveLength(0);
  expect(availableCoupons({ ...args, grants: [g] })[0].grant.id).toBe("g1");
  expect(availableCoupons({ ...args, grants: [{ ...g, expires_on: "2026-11-23" }] })).toHaveLength(0);
  expect(availableCoupons({ ...args, grants: [{ ...g, used_at: "2026-11-01" }] })).toHaveLength(0);
  expect(availableCoupons({ ...args, coupons: [{ ...c, active: false }], grants: [g] })).toHaveLength(0);
  expect(availableCoupons({ ...args, coupons: [{ ...c, endDate: "2026-11-01" }], grants: [g] })).toHaveLength(0);
});

const rows = [
  { key: "a", category: "剪髮加洗髮", amount: "1100" },
  { key: "b", category: "染髮", amount: "3000" },
  { key: "p", category: "產品銷售", amount: "5000" },
];

test("只折一項：限用服務那項；沒限用就折最貴的服務；產品不能折", () => {
  expect(planDiscount(cp({ reward: { kind: "amount", value: 200 }, services: ["剪髮加洗髮"] }), rows)).toMatchObject({ ok: true, rowKey: "a", discount: 200 });
  expect(planDiscount(cp({ reward: { kind: "amount", value: 200 } }), rows)).toMatchObject({ ok: true, rowKey: "b" });
  expect(planDiscount(cp({ services: ["產品銷售"] }), rows).ok).toBe(false);
  expect(planDiscount(cp({}), [rows[2]]).ok).toBe(false);
});

test("打折、送服務、折抵不超過那一項金額、消費門檻", () => {
  expect(planDiscount(cp({ reward: { kind: "percent", value: 9 }, services: ["染髮"] }), rows).discount).toBe(300);
  expect(planDiscount(cp({ reward: { kind: "percent", value: 85 }, services: ["染髮"] }), rows).discount).toBe(450);
  expect(planDiscount(cp({ reward: { kind: "free" }, services: ["剪髮加洗髮"] }), rows).discount).toBe(1100);
  expect(planDiscount(cp({ reward: { kind: "amount", value: 5000 }, services: ["剪髮加洗髮"] }), rows).discount).toBe(1100);
  expect(planDiscount(cp({ minSpend: 10000 }), rows).ok).toBe(false);
});

test("套用後金額變折後、記下原價；換券或取消會先還原，不會折兩次", () => {
  const c = cp({ reward: { kind: "amount", value: 200 }, services: ["剪髮加洗髮"] });
  const once = applyCoupon(rows, c, "g1").rows;
  expect(once[0]).toMatchObject({ amount: "900", originalAmount: 1100, discount: 200, couponId: "c1", couponGrantId: "g1" });
  const twice = applyCoupon(once, c, "g1").rows;
  expect(twice[0].amount).toBe("900");
  const back = removeCoupon(twice);
  expect(back[0].amount).toBe("1100");
  expect(back[0].couponId).toBeUndefined();
});

test("名單：符合條件、次數沒用完的人", () => {
  const c = cp({ trigger: { kind: "dormant", months: 6 } });
  const bob = { id: "bob", name: "Bob" };
  const list = eligibleCustomers({
    coupon: c, customers: [amy, bob],
    grants: [{ coupon_id: "c1", customer_id: "bob", used_at: "2026-01-01" }],
    transactions: [tx("amy", "2026-01-01"), tx("bob", "2026-01-01")], date: "2026-11-24",
  });
  expect(list.map((x) => x.id)).toEqual(["amy"]);
});

test("到期日：有效天數與活動截止取早的", () => {
  expect(expiryFor(cp({ validDays: 30, endDate: "" }), "2026-11-24")).toBe("2026-12-23");
  expect(expiryFor(cp({ validDays: 30, endDate: "2026-11-30" }), "2026-11-24")).toBe("2026-11-30");
  expect(expiryFor(cp({ validDays: 0, endDate: "" }), "2026-11-24")).toBe("");
});
