import { type AhClient, checkMutation, type MutationResult } from "./client.ts";

/** A named favourite list ("Mijn lijstjes"). */
export interface FavoriteList {
  id: string;
  name: string;
  itemCount: number;
  updatedAt?: string;
}

export async function getFavoriteLists(c: AhClient): Promise<FavoriteList[]> {
  // An empty ids argument means "all lists".
  const query = `query FavoriteLists {
  favoriteListV2(ids: []) { id description totalSize updatedAt }
}`;
  const data = await c.graphql<{
    favoriteListV2: { id: string; description: string; totalSize: number; updatedAt?: string }[] | null;
  }>(query);
  return (data.favoriteListV2 ?? []).map((l) => ({
    id: l.id,
    name: l.description,
    itemCount: l.totalSize,
    updatedAt: l.updatedAt,
  }));
}

/** Adds products (product ID → quantity), or updates quantities of ones already listed. */
export async function addToFavoriteList(c: AhClient, listId: string, quantities: Map<number, number>): Promise<void> {
  const mutation = `mutation AddToFavoriteList($id: String!, $products: [FavoriteListProductMutation!]!) {
  favoriteListProductsAddV2(id: $id, products: $products) { status errorMessage }
}`;
  const products = [...quantities].map(([productId, quantity]) => ({ productId, quantity }));
  const data = await c.graphql<{ favoriteListProductsAddV2: MutationResult }>(mutation, { id: listId, products });
  checkMutation(data.favoriteListProductsAddV2);
}

/** Removes products; returns how many were on the list. */
export async function removeFromFavoriteList(c: AhClient, listId: string, productIds: number[]): Promise<number> {
  // The delete mutation takes item IDs, not product IDs.
  const query = `query FavoriteListItems($ids: [String!]!) {
  favoriteListV2(ids: $ids) { items { id productId } }
}`;
  const lists = await c.graphql<{ favoriteListV2: { items: { id: string; productId: number }[] }[] | null }>(query, {
    ids: [listId],
  });
  const list = lists.favoriteListV2?.[0];
  if (!list) throw new Error(`favorite list ${listId} not found`);
  const remove = new Set(productIds);
  const itemIds = list.items.filter((it) => remove.has(it.productId)).map((it) => it.id);
  if (itemIds.length === 0) throw new Error("none of these products are on the favorite list");

  const mutation = `mutation RemoveFromFavoriteList($id: String!, $itemIds: [String!]!) {
  favoriteListProductsDeleteV2(id: $id, itemIds: $itemIds) { status errorMessage }
}`;
  const data = await c.graphql<{ favoriteListProductsDeleteV2: MutationResult }>(mutation, { id: listId, itemIds });
  checkMutation(data.favoriteListProductsDeleteV2);
  return itemIds.length;
}
