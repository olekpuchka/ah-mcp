import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { addToFavoriteList, getFavoriteLists, removeFromFavoriteList } from "../ahapi/index.ts";
import { addAuthedTool, json, orDefault, text, type ToolContext } from "./common.ts";

const listId = z.string().describe("Favorite list ID from ah_get_favorite_lists");

export function registerFavoriteListTools(server: McpServer, ctx: ToolContext): void {
  addAuthedTool(
    server,
    ctx,
    {
      name: "ah_get_favorite_lists",
      title: "Albert Heijn: View Favourite Lists",
      kind: "readOnly",
      description:
        "List all Albert Heijn favorite/saved shopping lists with their names and item counts. " +
        "Use the returned list ID with ah_add_to_favorite_list or ah_remove_from_favorite_list.",
    },
    async (c) => {
      const lists = await getFavoriteLists(c);
      if (lists.length === 0) return text("You have no favorite lists.");
      return json(lists.map((l) => ({ id: l.id, name: l.name, item_count: l.itemCount, updated_at: l.updatedAt })));
    },
  );

  addAuthedTool(
    server,
    ctx,
    {
      name: "ah_add_to_favorite_list",
      title: "Albert Heijn: Add to Favourite List",
      kind: "additive",
      description: "Add products to a named Albert Heijn favorite list. Get list_id from ah_get_favorite_lists.",
      input: {
        list_id: listId,
        items: z
          .array(z.object({ product_id: z.number().int(), quantity: z.number().int() }))
          .describe('Items to add, e.g. [{"product_id": 123456, "quantity": 1}]. Quantity 0 is treated as 1.'),
      },
    },
    async (c, args) => {
      if (!args.list_id) throw new Error("list_id is required");
      const quantities = new Map<number, number>();
      for (const it of args.items) if (it.product_id > 0) quantities.set(it.product_id, orDefault(it.quantity, 1));
      if (quantities.size === 0) throw new Error("no valid items provided");
      await addToFavoriteList(c, args.list_id, quantities);
      return text(`Added ${quantities.size} item(s) to favorite list ${args.list_id}.`);
    },
  );

  addAuthedTool(
    server,
    ctx,
    {
      name: "ah_remove_from_favorite_list",
      title: "Albert Heijn: Remove from Favourite List",
      kind: "destructive",
      description: "Remove products from a named Albert Heijn favorite list. Get list_id from ah_get_favorite_lists.",
      input: {
        list_id: listId,
        product_ids: z.array(z.number().int()).describe("Product IDs to remove, e.g. [123456, 789012]"),
      },
    },
    async (c, args) => {
      if (!args.list_id) throw new Error("list_id is required");
      const ids = args.product_ids.filter((id) => id > 0);
      if (ids.length === 0) throw new Error("no valid product_ids provided");
      const removed = await removeFromFavoriteList(c, args.list_id, ids);
      return text(`Removed ${removed} product(s) from favorite list ${args.list_id}.`);
    },
  );
}
