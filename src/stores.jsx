// =====================================================================
// stores.jsx — 分店設定
//
// 只放分店資料（店名、地址、LOGO、營業時間）。
// 設計師介紹與班表在後台編輯，不在這裡——見 roster.jsx。
// =====================================================================

const BASE = import.meta.env.BASE_URL || "/";
const img = (p) => BASE + p.replace(/^\//, "");

/* =====================================================================
   一、分店
   ===================================================================== */

export const STORES = [
  {
    id: "luz",
    name: "LUZ",
    logo: img("stores/luz.png"),
    address: "330 桃園市桃園區中山路 611 號",
    phone: "",                      // ← 填了客人才看得到，選填
    tagline: "Made in Taoyuan",
    blurb: "桃園中山路上的本店。",
    // 營業時間。兩家店不同的話各自改。
    openTime: "10:00",
    closeTime: "21:00",
  },
  {
    id: "ali",
    name: "阿麗",
    logo: img("stores/ali.png"),
    address: "338 桃園市蘆竹區忠孝西路 175 巷 49 號",
    phone: "",
    tagline: "",
    blurb: "蘆竹忠孝西路的分店。",
    openTime: "10:00",
    closeTime: "21:00",
  },
];

/* =====================================================================
   以下是程式用的，不用改
   ===================================================================== */

export const DEFAULT_STORE_ID = STORES[0].id;

export function getStore(storeId) {
  return STORES.find((s) => s.id === storeId) || null;
}

export function storeName(storeId) {
  const s = getStore(storeId);
  return s ? s.name : "";
}

/** 該店的營業時間，找不到就回傳預設值 */
export function hoursOfStore(storeId, fallback) {
  const s = getStore(storeId);
  if (!s) return fallback || { openTime: "10:00", closeTime: "21:00" };
  return { openTime: s.openTime, closeTime: s.closeTime };
}
