import { type FavoriteList, type Nutrient, type Order, type Product, productImage, productPrices, productUrl } from "../ahapi/index.ts";

/** Product in search and list results. */
interface ProductSummary {
  id: number;
  title: string;
  url: string;
  price: number;
  bonus_price?: number;
  unit?: string;
  is_bonus: boolean;
  bonus_mechanism?: string;
  image_url?: string;
}

export function summarizeProduct(p: Product): ProductSummary {
  const { regular, bonus } = productPrices(p);
  return {
    id: p.webshopId,
    title: p.title,
    url: productUrl(p.webshopId, p.title),
    price: regular,
    bonus_price: bonus || undefined,
    unit: p.salesUnitSize || undefined,
    is_bonus: Boolean(p.isBonus),
    bonus_mechanism: p.bonusMechanism || undefined,
    image_url: productImage(p) || undefined,
  };
}

/** Product in ah_get_products. */
export function detailProduct(p: Product, nutrition: Nutrient[] | undefined) {
  const { regular, bonus } = productPrices(p);
  return {
    id: p.webshopId,
    title: p.title,
    url: productUrl(p.webshopId, p.title),
    brand: p.brand || undefined,
    category: p.mainCategory || undefined,
    description: p.descriptionHighlights || undefined,
    price: regular,
    bonus_price: bonus || undefined,
    unit_size: p.salesUnitSize || undefined,
    unit_price_description: p.unitPriceDescription || undefined,
    is_bonus: Boolean(p.isBonus),
    bonus_mechanism: p.bonusMechanism || undefined,
    nutri_score: p.nutriscore || undefined,
    is_available: Boolean(p.isOrderable),
    property_icons: p.propertyIcons?.length ? p.propertyIcons : undefined,
    nutritional_info: nutrition?.length ? nutrition : undefined,
    image_url: productImage(p) || undefined,
  };
}

export function viewOrder(o: Order) {
  return {
    id: o.id,
    state: o.state || undefined,
    items: o.items.map((it) => ({
      product_id: it.productId,
      name: it.title || undefined,
      url: productUrl(it.productId, it.title),
      quantity: it.quantity,
      price: it.price || undefined,
    })),
    total_price: o.totalPrice || undefined,
    total_discount: o.totalDiscount || undefined,
  };
}

export function viewFavoriteList(l: FavoriteList) {
  return { id: l.id, name: l.name, item_count: l.itemCount, updated_at: l.updatedAt };
}
