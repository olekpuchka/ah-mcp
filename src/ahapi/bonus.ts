import type { AhClient } from "./client.ts";
import type { Product } from "./products.ts";

/** Weekly bonus period. Index 0 is this week; next week appears a few days before it starts. */
export interface BonusPeriod {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  /** When the following week's bonus becomes visible (YYYY-MM-DD). */
  nextVisibleFrom?: string;
  /** National categories, for getBonusSection. */
  categories: string[];
}

/** Published bonus periods, current week first. */
export async function getBonusPeriods(c: AhClient): Promise<BonusPeriod[]> {
  const res = await c.request<{
    periods?: {
      bonusStartDate: string;
      bonusEndDate: string;
      nextPeriodVisibleFrom?: string;
      tabs?: { urlMetadataList?: { bonusType: string; description: string }[] }[];
    }[];
  }>("/mobile-services/bonuspage/v3/metadata");
  return (res.periods ?? []).map((p) => {
    const categories = new Set<string>();
    for (const tab of p.tabs ?? []) {
      for (const m of tab.urlMetadataList ?? []) {
        if (m.bonusType === "NATIONAL" && m.description) categories.add(m.description);
      }
    }
    return {
      start: p.bonusStartDate,
      end: p.bonusEndDate,
      nextVisibleFrom: p.nextPeriodVisibleFrom,
      categories: [...categories],
    };
  });
}

/** Group deal, e.g. "2+1 gratis". */
export interface BonusGroup {
  /** For getBonusGroupProducts. */
  id: string;
  segmentDescription: string;
  discountDescription?: string;
  category?: string;
  exampleFromPrice?: number;
  exampleForPrice?: number;
  products?: Product[];
}

/** Bonus page entry: a product or a group deal. */
export interface BonusOffer {
  product?: Product;
  group?: BonusGroup;
}

async function fetchSection(c: AhClient, path: string, params: Record<string, string>): Promise<BonusOffer[]> {
  const query = new URLSearchParams({ application: "AHWEBSHOP", ...params });
  const res = await c.request<{ bonusGroupOrProducts?: { product?: Product; bonusGroup?: BonusGroup }[] }>(
    `/mobile-services/bonuspage/v2/${path}?${query}`,
  );
  return (res.bonusGroupOrProducts ?? []).map((it) => ({ product: it.product, group: it.bonusGroup }));
}

/** National offers of a category; date picks the bonus period. */
export function getBonusSection(c: AhClient, category: string, date: string): Promise<BonusOffer[]> {
  return fetchSection(c, "section", { date, promotionType: "NATIONAL", category });
}

/** Offers on products the member bought before (AH's "Eerder gekocht"); date picks the bonus period. */
export function getPreviouslyBoughtBonus(c: AhClient, date: string): Promise<BonusOffer[]> {
  return fetchSection(c, "section/previously-bought", { date });
}

/** Products of a group deal. */
export async function getBonusGroupProducts(c: AhClient, groupId: string, period: BonusPeriod): Promise<Product[]> {
  const query = `query BonusGroupProducts($id: String, $start: String, $end: String) {
  bonusPromotions(input: {id: $id, periodStart: $start, periodEnd: $end}) {
    products { id title brand salesUnitSize priceV2 { now { amount } was { amount } } }
  }
}`;
  const data = await c.graphql<{
    bonusPromotions: {
      products: {
        id: number;
        title: string;
        brand?: string;
        salesUnitSize?: string;
        priceV2?: { now?: { amount: number } | null; was?: { amount: number } | null };
      }[];
    }[];
  }>(query, { id: groupId, start: period.start, end: period.end });
  return data.bonusPromotions.flatMap((promo) =>
    promo.products.map((p) => ({
      webshopId: p.id,
      title: p.title,
      brand: p.brand,
      salesUnitSize: p.salesUnitSize,
      currentPrice: p.priceV2?.now?.amount,
      priceBeforeBonus: p.priceV2?.was?.amount,
      isBonus: true,
    })),
  );
}
