import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getRecipe, recipeUrl, searchRecipes } from "../ahapi/index.ts";
import { addAuthedTool, json, orDefault, text, type ToolContext, wrapError } from "./common.ts";

export function registerRecipeTools(server: McpServer, ctx: ToolContext): void {
  addAuthedTool(
    server,
    ctx,
    {
      name: "ah_search_recipes",
      title: "Albert Heijn: Search Recipes",
      kind: "readOnly",
      description:
        "Search Allerhande, Albert Heijn's recipe collection. Dutch search terms work best, " +
        "e.g. 'pasta', 'vegetarisch', 'stamppot', 'kip curry'. " +
        "Returns id, title, url, cook_minutes, servings, courses, nutri_score, rating. " +
        "Use the id with ah_get_recipe for ingredients and steps.",
      input: {
        query: z.string().describe("Search text, e.g. 'pasta zalm'"),
        limit: z.number().int().optional().describe("Maximum number of results (default 10, max 30)"),
      },
    },
    async (c, args) => {
      if (!args.query.trim()) throw new Error("query is required");
      const { total, recipes } = await searchRecipes(c, args.query, Math.min(orDefault(args.limit, 10), 30));
      if (recipes.length === 0) return text(`No recipes found for "${args.query}".`);
      return json({
        total,
        recipes: recipes.map((r) => ({
          id: r.id,
          title: r.title,
          url: recipeUrl(r.id, r.slug),
          cook_minutes: r.time?.cook || undefined,
          oven_minutes: r.time?.oven || undefined,
          wait_minutes: r.time?.wait || undefined,
          servings: r.serving ? `${r.serving.number} ${r.serving.type}` : undefined,
          courses: r.courses?.length ? r.courses : undefined,
          nutri_score: r.nutriScore || undefined,
          rating: rating(r.rating),
        })),
      });
    },
  );

  addAuthedTool(
    server,
    ctx,
    {
      name: "ah_get_recipe",
      title: "Albert Heijn: Recipe",
      kind: "readOnly",
      description:
        "Get an Allerhande recipe by id: ingredients, preparation steps, and nutrition per serving. " +
        "Set servings to scale the ingredient quantities. " +
        "To shop for it, search the ingredients with ah_search_products and add them with ah_add_to_shopping_list.",
      input: {
        recipe_id: z.number().int().describe("Recipe id from ah_search_recipes"),
        servings: z.number().int().optional().describe("Number of servings to scale the ingredients to"),
      },
    },
    async (c, args) => {
      if (args.recipe_id <= 0) throw new Error("recipe_id is required");
      const servings = args.servings && args.servings > 0 ? args.servings : undefined;
      const r = await getRecipe(c, args.recipe_id, servings).catch((err: unknown) => {
        // AH redacts the reason, which is usually an unknown id. The cause keeps a 401 visible.
        throw wrapError(`could not get recipe ${args.recipe_id}; check the id`, err);
      });
      const n = r.nutritions;
      return json({
        id: r.id,
        title: r.title,
        url: `https://www.ah.nl${r.href}`,
        description: r.description || undefined,
        cook_minutes: r.cookTime || undefined,
        servings: `${servings ?? r.servings.number} ${r.servings.type}`,
        courses: r.courses?.length ? r.courses : undefined,
        cuisines: r.cuisines?.length ? r.cuisines : undefined,
        nutri_score: r.nutriScore || undefined,
        rating: rating(r.rating),
        ingredients: r.ingredients.map((i) => i.text),
        steps: r.preparation?.steps ?? [],
        nutrition_per_serving: n
          ? Object.fromEntries(
              Object.values(n)
                .filter((x) => x != null)
                .map((x) => [x.name, `${x.value} ${x.unit}`]),
            )
          : undefined,
      });
    },
  );
}

function rating(r: { average?: number | null; count?: number | null } | null | undefined): string | undefined {
  return r?.average && r.count ? `${r.average.toFixed(1)}/5 (${r.count})` : undefined;
}
