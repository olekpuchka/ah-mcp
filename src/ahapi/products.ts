import type { AhClient } from "./client.ts";

/** Product card from search and detail responses. */
export interface Product {
  webshopId: number;
  title: string;
  brand?: string;
  mainCategory?: string;
  salesUnitSize?: string;
  unitPriceDescription?: string | null;
  descriptionHighlights?: string;
  nutriscore?: string | null;
  propertyIcons?: string[];
  images?: { url: string; width: number; height: number }[];
  /** Price now, bonus discount included. */
  currentPrice?: number;
  /** Regular price. */
  priceBeforeBonus?: number;
  isBonus?: boolean;
  bonusMechanism?: string | null;
  isOrderable?: boolean;
}

/**
 * Regular price, and the bonus price for products on bonus (else 0). Deals like
 * "2 voor 1.19" have no single bonus price: AH sends the regular price as both.
 */
export function productPrices(p: Product): { regular: number; bonus: number } {
  const now = p.currentPrice || p.priceBeforeBonus || 0;
  const regular = p.priceBeforeBonus || now;
  return { regular, bonus: p.isBonus && now < regular ? now : 0 };
}

/** Product page on ah.nl: /producten/product/wi<id>/<title slug>. */
export function productUrl(id: number, title = ""): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `https://www.ah.nl/producten/product/wi${id}${slug ? `/${slug}` : ""}`;
}

/** URL of the first image, or "". */
export function productImage(p: Product): string {
  return p.images?.[0]?.url ?? "";
}

/** Searches by keyword, most relevant first; returns at most size products. */
export async function searchProducts(c: AhClient, query: string, size: number): Promise<Product[]> {
  const params = new URLSearchParams({ query, page: "0", size: String(size), sortOn: "RELEVANCE" });
  const res = await c.request<{ products?: Product[] }>(`/mobile-services/product/search/v2?${params}`);
  return (res.products ?? []).slice(0, size);
}

export async function getProduct(c: AhClient, id: number): Promise<Product> {
  const res = await c.request<{ productCard: Product }>(`/mobile-services/product/detail/v4/fir/${id}`);
  return res.productCard;
}

/** Returns products in the order of ids. */
export async function productsByIds(c: AhClient, ids: number[]): Promise<Product[]> {
  const params = new URLSearchParams({ sortOn: "INPUT_PRODUCT_IDS" });
  for (const id of ids) params.append("ids", String(id));
  return (await c.request<Product[]>(`/mobile-services/product/search/v2/products?${params}`)) ?? [];
}

/** Nutrition table row. */
export interface Nutrient {
  type: string;
  name: string;
  value: string;
}

/** First nutrition table (usually per 100 g/ml), or undefined if AH has none. */
export async function getNutrition(c: AhClient, id: number): Promise<Nutrient[] | undefined> {
  const query = `query ProductNutrition($id: Int!) {
  product(id: $id) {
    tradeItem { nutritions { nutrients { type name value } } }
  }
}`;
  const data = await c.graphql<{
    product: { tradeItem: { nutritions: { nutrients: Nutrient[] }[] | null } | null };
  }>(query, { id });
  return data.product.tradeItem?.nutritions?.[0]?.nutrients;
}
