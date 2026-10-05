import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type AhClient, getNutrition, getProduct, type Product, searchProducts } from "../ahapi/index.ts";
import { addAuthedTool, json, nonFatal, orDefault, parallel, type ToolContext, withRetry } from "./common.ts";
import { detailProduct, summarizeProduct } from "./views.ts";

const MAX_QUERIES = 10;
const MAX_PRODUCT_IDS = 20;

export function registerProductTools(server: McpServer, ctx: ToolContext): void {
  addAuthedTool(
    server,
    ctx,
    {
      name: "ah_search_products",
      title: "Albert Heijn: Search Products",
      kind: "readOnly",
      description:
        "Search Albert Heijn (Dutch supermarket) products by keyword. " +
        "Pass one or more queries (max 10) to search for several products in one call. " +
        "Prefer Dutch search terms for best results: " +
        "e.g. 'melk' (milk), 'kaas' (cheese), 'brood' (bread), 'kip' (chicken), 'appel' (apple). " +
        "Set bonus=true to return only products currently on promotion. " +
        "Returns, per query: id, title, price, bonus_price, unit, is_bonus, bonus_mechanism, image_url.",
      input: {
        queries: z
          .array(z.string())
          .describe('Search queries in Dutch or English, e.g. ["melk"] or ["melk", "kaas", "brood"] (max 10)'),
        limit: z
          .number()
          .int()
          .optional()
          .describe("Maximum results per query (default 10 for one query, 5 for several; max 30)"),
        bonus: z.boolean().optional().describe("Return only products currently on bonus/promotion"),
      },
    },
    async (c, { queries, limit, bonus }) => {
      const qs = queries.filter(Boolean).slice(0, MAX_QUERIES);
      if (qs.length === 0) throw new Error("provide at least one search query");
      const perQuery = Math.min(orDefault(limit, qs.length > 1 ? 5 : 10), 30);

      const results = qs.map((query) => ({
        query,
        results: [] as ReturnType<typeof summarizeProduct>[],
        error: undefined as string | undefined,
      }));
      await parallel(qs.length, 3, async (i) => {
        const r = results[i]!;
        await nonFatal(
          async () => {
            r.results = (await search(ctx, c, r.query, perQuery, Boolean(bonus))).map(summarizeProduct);
          },
          (err) => {
            r.error = (err as Error).message;
          },
        );
      });
      return json(results);
    },
  );

  addAuthedTool(
    server,
    ctx,
    {
      name: "ah_get_products",
      title: "Albert Heijn: Product Details",
      kind: "readOnly",
      description:
        "Get detailed information about one or more Albert Heijn products by ID (max 20). " +
        "Returns title, brand, category, description, price, unit size, bonus info, NutriScore, property icons. " +
        "Set include_nutritional_info=true to also return calories, fat, protein, etc. " +
        "Get product IDs from ah_search_products.",
      input: {
        product_ids: z
          .array(z.number().int())
          .describe("Product IDs from ah_search_products, e.g. [123456] or [123456, 789012] (max 20)"),
        include_nutritional_info: z.boolean().optional().describe("Include nutritional values (default false)"),
      },
    },
    async (c, { product_ids, include_nutritional_info }) => {
      const ids = product_ids.filter((id) => id > 0).slice(0, MAX_PRODUCT_IDS);
      if (ids.length === 0) throw new Error("provide at least one product ID");

      const results: unknown[] = new Array(ids.length);
      await parallel(ids.length, 5, async (i) => {
        const id = ids[i]!;
        const key = String(id);
        results[i] = await nonFatal<unknown>(
          async () => {
            const p = await ctx.products.getOrLoad(key, () => withRetry("ah_get_products", () => getProduct(c, id)));
            const nutrition = include_nutritional_info
              ? await ctx.nutrition.getOrLoad(key, () => withRetry("ah_get_products", () => getNutrition(c, id)))
              : undefined;
            return detailProduct(p, nutrition);
          },
          (err) => ({ id, error: (err as Error).message }),
        );
      });
      return json(results);
    },
  );
}

/** Cached, retried product search. onlyBonus keeps only products on bonus. */
function search(ctx: ToolContext, c: AhClient, query: string, limit: number, onlyBonus: boolean): Promise<Product[]> {
  return ctx.searches.getOrLoad(`${query}:${limit}:${onlyBonus}`, async () => {
    // The API can't filter on bonus: over-fetch, then filter.
    const size = onlyBonus ? Math.min(Math.max(limit * 4, 40), 100) : limit;
    const products = await withRetry("ah_search_products", () => searchProducts(c, query, size));
    return onlyBonus ? products.filter((p) => p.isBonus).slice(0, limit) : products;
  });
}
