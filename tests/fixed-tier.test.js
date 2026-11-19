// 設計師固定方案：選了設計師，剪髮加洗髮自動帶入他的方案價格
import { staffFixedPlans, applyPlan, priceChipsByCategory } from "../src/services";

const services = [{
  id: "sv-wash-cut", name: "剪髮加洗髮",
  tiers: [
    { id: "t1", label: "方案一", price: 800, durationMin: 60 },
    { id: "t2", label: "方案二", price: 1100, durationMin: 60 },
    { id: "t3", label: "方案三", price: 2000, durationMin: 75 },
  ],
  addons: [{ id: "a1", label: "加洗", price: 200 }],
}];
const roster = { profiles: {
  mark: { rates: { "sv-wash-cut": { fixedTierId: "t3", price: 2000 } } },
  paul: { rates: { "sv-wash-cut": { priceAdj: 100 } } },
  bad: { rates: { "sv-wash-cut": { fixedTierId: "已刪掉的方案" } } },
} };
const chips = priceChipsByCategory(services);

test("有設固定方案的設計師才有，方案被刪掉的不算", () => {
  const plans = staffFixedPlans(roster, services);
  expect(plans.mark["剪髮加洗髮"]).toMatchObject({ chipId: "t3", price: 2000 });
  expect(plans.paul).toBeUndefined();
  expect(plans.bad).toBeUndefined();
});

test("用按鈕選的價格會換成設計師的，加價項目保留", () => {
  const plan = staffFixedPlans(roster, services).mark;
  const r = { category: "剪髮加洗髮", chipId: "t1", amount: "1000", addonIds: ["a1"] };
  expect(applyPlan(r, plan, chips)).toMatchObject({ chipId: "t3", amount: "2200" });
});

test("手打的金額不動；沒有固定方案的分類不動", () => {
  const plan = staffFixedPlans(roster, services).mark;
  const typed = { category: "剪髮加洗髮", chipId: "", amount: "1500", addonIds: [] };
  expect(applyPlan(typed, plan, chips)).toBe(typed);
  const other = { category: "染髮", chipId: "x", amount: "3000", addonIds: [] };
  expect(applyPlan(other, plan, chips)).toBe(other);
});
