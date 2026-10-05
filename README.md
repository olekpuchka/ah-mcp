<p align="center"><img src="assets/logo.png" alt="" width="128" height="128"></p>

# albert-heijn-mcp

[![npm](https://img.shields.io/npm/v/albert-heijn-mcp?color=cb3837&logo=npm)](https://www.npmjs.com/package/albert-heijn-mcp)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node.js 24](https://img.shields.io/badge/node-24%20LTS-339933?logo=node.js&logoColor=white)](.nvmrc)
[![MCP](https://img.shields.io/badge/MCP-server-6E56CF)](https://modelcontextprotocol.io)

**Your Albert Heijn account, in your AI assistant.**

albert-heijn-mcp is a [Model Context Protocol](https://modelcontextprotocol.io) server for Albert Heijn 🇳🇱. Connect it to any MCP client and just ask: find products and bonus deals, plan meals from Allerhande recipes, keep your shopping list and delivery order up to date, and look back at what you've bought.

> [!NOTE]
> An unofficial project, not affiliated with or endorsed by Albert Heijn. It uses the same API as the AH mobile app, which may change without notice.

---

## Contents

- [What you can ask](#what-you-can-ask)
- [Quick start](#quick-start)
- [Logging in](#logging-in)
- [Connecting a client](#connecting-a-client)
- [Configuration](#configuration)
- [Deploying to a server](#deploying-to-a-server)
- [Tools](#tools) and [limitations](#limitations)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

## What you can ask

Ask in Dutch, English or any language your assistant speaks:

> *"Wat is er deze week in de bonus van wat ik meestal koop?"*

**Plan meals**

> *"Find a vegetarian Allerhande recipe under 30 minutes for two, and put the ingredients on my shopping list. I already have olive oil and salt."*

> *"Scale the panlasagne recipe to six people and tell me how much salmon I need."*

> *"Plan three weeknight dinners around what's on bonus this week."*

**Save money**

> *"Which products I usually buy are on bonus this week?"*

> *"Rebuild tonight's stir-fry with ingredients that are on bonus, without changing the recipe too much."*

> *"Is next week's bonus out yet? If not, when does it appear?"*

> *"What's in the 2+1 gratis kaas deal?"*

**Shop**

> *"Put the products I've had delivered at least three times back on my list."*

> *"Find organic, gluten-free pasta, cheapest first."*

> *"Compare the protein and sugar in these three yoghurts and add the best one to my list."*

> *"When can AH deliver on Saturday?"*

> *"The courgettes are sold out. What else would work in this recipe?"*

> *"Add two more packs of milk to my upcoming delivery."*

> *"Make a favourites list called Pasta night with everything from this recipe."*

> *"Any vandaag-af bread or vegetables at my local AH worth picking up tonight?"*

**Look back**

> *"How much did my in-store receipts add up to in September, and what were the five priciest items?"*

> *"Show the receipt from my last shop and list anything I bought more than once."*

## Quick start

**Requirements:** Node.js 24 (LTS) and an Albert Heijn account.

There's nothing to install: [connect a client](#connecting-a-client) with `npx -y albert-heijn-mcp`, which downloads and runs the [latest version](https://www.npmjs.com/package/albert-heijn-mcp), then ask it to log you in to Albert Heijn.

To install it permanently instead, run `npm install --global albert-heijn-mcp` and use the `albert-heijn-mcp` command. To [build from source](#development), clone the repository.

## Logging in

AH's login page has a captcha that only works on AH's own site, so logging in takes two steps:

1. **Ask your assistant to log you in.** It calls `ah_login` and gives you a link to AH's login page; locally, it also opens in your browser. Log in as usual.
2. **Paste the code back.** After you log in, AH redirects to a link meant for its iPhone app, which the browser can't open, so the page stays put. Open the developer console (Chrome: <kbd>⌘</kbd> <kbd>⌥</kbd> <kbd>J</kbd> on Mac, <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>J</kbd> on Windows/Linux) and find this line:

   ```
   Failed to launch 'appie://login-exit?code=…' because the scheme does not have a registered handler.
   ```

   Copy the `appie://login-exit?code=…` link into the chat. The code works once and expires quickly, so paste it right away.

You only log in once. Tokens are stored on your machine and refreshed automatically:

| OS | Location |
|---|---|
| macOS | `~/Library/Application Support/albert-heijn-mcp/tokens.json` |
| Linux | `~/.config/albert-heijn-mcp/tokens.json` |
| Windows | `%AppData%\albert-heijn-mcp\tokens.json` |

The file is readable only by your user. Override the location with `AH_TOKENS_PATH`.

## Connecting a client

albert-heijn-mcp works with any MCP client. It runs locally over stdio, or on a server over Streamable HTTP.

### Local clients (stdio)

Install it in one click:

[![Install in Cursor](https://img.shields.io/badge/Cursor-Install_server-000000?logo=cursor&logoColor=white)](https://cursor.com/en/install-mcp?name=ah&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImFsYmVydC1oZWlqbi1tY3AiXX0%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_server-0098FF)](https://insiders.vscode.dev/redirect/mcp/install?name=ah&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22albert-heijn-mcp%22%5D%7D)
Other clients that start MCP servers as a local command run `npx -y albert-heijn-mcp`. Most of them take this JSON in their MCP settings:

```json
{
  "mcpServers": {
    "ah": {
      "command": "npx",
      "args": ["-y", "albert-heijn-mcp"]
    }
  }
}
```

Where the settings live differs per client; see its documentation. Clients with a CLI usually have an add command instead, e.g. `<client> mcp add ah -- npx -y albert-heijn-mcp`. It is also listed in the [MCP Registry](https://registry.modelcontextprotocol.io), which some clients install from.

> [!TIP]
> Desktop apps don't load your shell profile, so they may not find `npx` (common with nvm). Then set `command` to the output of `which npx`. For a source checkout, use `node` with the argument `/path/to/albert-heijn-mcp/dist/index.js`.

### Remote clients (Streamable HTTP)

Web apps such as ChatGPT and Claude.ai only connect to servers on the internet. Set one up first ([Deploying to a server](#deploying-to-a-server)). The endpoint is `https://your-server/mcp`.

Clients log in with OAuth: add the endpoint with OAuth (or automatic) authentication, and the client opens a login page on your server. Enter your `AH_MCP_TOKEN` there once; the client then gets its own tokens and renews them. The server accepts only these OAuth tokens, not `AH_MCP_TOKEN` itself, so clients without OAuth support can't connect over HTTP; run them locally over [stdio](#local-clients-stdio) instead.

**ChatGPT**: needs Developer mode (Plus, Pro, Business, Enterprise and Education). Open Settings → advanced settings, turn on Developer mode, and create a connector with the endpoint. Set authentication to **OAuth**.

**Claude.ai**: Settings → Connectors → Add custom connector, then paste the endpoint and choose Connect.

> [!IMPORTANT]
> Anyone with `AH_MCP_TOKEN` can log in and use your Albert Heijn account. Use a long random value (`openssl rand -hex 32`). Changing it logs out every client.

## Configuration

Settings are environment variables. They can also go in a `.env` file in the working directory (see [`.env.example`](.env.example)); variables already set in the environment take precedence.

| Variable | Default | Description |
|---|---|---|
| `AH_REMOTE` | `false` | Don't open a browser on login (same as `--remote`). Always on with `streamable-http`. |
| `AH_TOKENS_PATH` | [per OS](#logging-in) | Where to store login tokens. |
| `AH_MCP_HOST` | `127.0.0.1` | Interface the HTTP server listens on. Keep the default behind a reverse proxy. |
| `AH_MCP_PORT` | `3000` | HTTP server port. |
| `AH_MCP_BASE_URL` | `http://localhost:3000` | Public URL of the HTTP server. Set it on a server: OAuth clients are sent to this URL to log in, and for a non-local URL the localhost-only `Host` check is turned off so a reverse proxy can forward requests. |
| `AH_MCP_TOKEN` | — | Secret for the HTTP transport, at least 32 characters; the transport doesn't start without it. You enter it on the OAuth login page; it also signs the OAuth tokens. |
| `AH_LOG_FILE` | — | Also append logs to this file. Logs always go to stderr. |

Command-line flags:

```
node dist/index.js [--transport stdio|streamable-http] [--remote] [--version] [--help]
```

`stdio` (the default) is for local clients; `streamable-http` serves MCP at `/mcp`, with OAuth login at `/authorize`.

## Deploying to a server

albert-heijn-mcp runs as a hardened systemd service behind a reverse proxy, installed from npm.

1. **Prepare the server.** Install Node.js 24 and create a service user:

   ```bash
   sudo useradd -r -m -d /home/albert-heijn-mcp -s /sbin/nologin albert-heijn-mcp
   ```

2. **Configure it** in `/home/albert-heijn-mcp/.env`:

   ```env
   AH_MCP_BASE_URL=https://albert-heijn-mcp.example.com
   AH_MCP_TOKEN=<output of: openssl rand -hex 32>
   ```

   Make it readable only by the service: `sudo chown albert-heijn-mcp: /home/albert-heijn-mcp/.env && sudo chmod 600 /home/albert-heijn-mcp/.env`.

3. **Install it** with the [service unit](deploy/albert-heijn-mcp.service) that comes with the package (it runs in `--remote` mode):

   ```bash
   sudo npm install --global --prefix /usr/local --ignore-scripts albert-heijn-mcp
   sudo install -m 644 /usr/local/lib/node_modules/albert-heijn-mcp/deploy/albert-heijn-mcp.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now albert-heijn-mcp
   ```

   To update, run the same commands, then `sudo systemctl restart albert-heijn-mcp`.

4. **Add TLS** with a reverse proxy that forwards to `127.0.0.1:3000`. With Caddy:

   ```
   albert-heijn-mcp.example.com {
       reverse_proxy 127.0.0.1:3000
   }
   ```

The service can write only to `/home/albert-heijn-mcp`, where it keeps its tokens. If you point `AH_LOG_FILE` elsewhere, add that path to `ReadWritePaths` in the unit file.

## Tools

Read-only tools are marked as such, so clients can run them without asking. Tools that remove data are marked destructive, so clients ask for confirmation first.

Tools that return data also return it as [structured output](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#structured-content) with a declared schema, for clients that use it. Products and recipes in tool results include a `url` to their page on ah.nl, and the server asks the assistant to link their names to it.

<details open>
<summary><b>Account</b></summary>

| Tool | Description |
|---|---|
| `ah_login` | Log in: returns AH's login link, then completes the login with the code you paste back. |
| `ah_logout` | Delete the stored tokens, to switch accounts or reset a session. |
| `ah_get_member_profile` | Name, masked email, and bonus card number (last 4 digits). |

</details>

<details open>
<summary><b>Products & offers</b></summary>

| Tool | Description |
|---|---|
| `ah_search_products` | Search one or more keywords at once; Dutch terms work best. Filter by `bonus=true` or by `filters` (organic, vegan, gluten_free and other diets, allergens and labels), and `sort` by price, what you buy most, or Nutri-Score. |
| `ah_get_products` | Details for one or more products. `include_nutritional_info=true` adds the nutrition table. |
| `ah_get_product_alternatives` | Similar products and substitutes AH suggests for a product. |
| `ah_get_bonus_offers` | This week's bonus offers, or next week's with `period=next`. `previously_bought=true` limits them to products you bought before (AH's "Eerder gekocht"). Can filter by keyword. |
| `ah_get_bonus_group_products` | The individual products behind a group deal such as "2+1 gratis". |
| `ah_search_stores` | Nearby stores, by postal code or your own address. |
| `ah_get_last_chance_items` | Vandaag-af markdowns in a store; the one nearest your address by default. |

</details>

<details open>
<summary><b>Recipes</b></summary>

| Tool | Description |
|---|---|
| `ah_search_recipes` | Search Allerhande recipes; Dutch terms work best. |
| `ah_get_recipe` | Ingredients, steps, and nutrition per serving. `servings` scales the ingredients. |
| `ah_add_recipe_to_shopping_list` | Match a recipe's ingredients to products and add them to the list in one step. `skip` leaves out what you have; `dry_run=true` previews the matches. |

</details>

<details open>
<summary><b>Shopping list & favourites</b></summary>

| Tool | Description |
|---|---|
| `ah_get_shopping_list` | Your shopping list ("Mijn lijst"), the basket you fill while shopping. |
| `ah_add_to_shopping_list` | Put products on the list, with a quantity each. |
| `ah_add_free_text_to_shopping_list` | Add a free-text item, like "verse bloemen". |
| `ah_remove_from_shopping_list` | Remove products or free-text items. |
| `ah_clear_shopping_list` | Remove everything. Requires `confirm="yes"`. |
| `ah_get_favorite_lists` | Your favourite lists ("Mijn lijstjes"). |
| `ah_add_to_favorite_list` | Add products to a favourite list. |
| `ah_remove_from_favorite_list` | Take products off a favourite list. |
| `ah_create_favorite_list` | Start a new, empty favourite list. |
| `ah_delete_favorite_list` | Delete a favourite list and its items. Requires `confirm="yes"`. |

</details>

<details open>
<summary><b>Delivery order</b></summary>

Choosing a delivery or pick-up slot in the AH app moves your shopping list into an order. `ah_get_delivery_slots` shows when delivery is possible; the other tools work on that order.

| Tool | Description |
|---|---|
| `ah_get_delivery_slots` | Delivery windows at your address for the coming days. |
| `ah_get_cart` | Products in the active order, with total price and discount. |
| `ah_update_cart_item` | Change a product's quantity; 0 takes it out. |
| `ah_remove_from_cart` | Remove a product from the order. |
| `ah_clear_cart` | Remove everything from the order. Requires `confirm="yes"`. |

</details>

<details open>
<summary><b>Orders & receipts</b></summary>

| Tool | Description |
|---|---|
| `ah_get_orders` | Upcoming delivery orders, or past ones with `past=true`. |
| `ah_get_order_details` | Products in one order. |
| `ah_get_frequent_items` | Your most-ordered products, counted over your delivery orders. |
| `ah_get_receipts` | Recent in-store receipts (kassabonnen). |
| `ah_get_receipt_details` | Items, discounts and payment for one receipt. |

</details>

### Limitations

- **Delivery orders can't be started through the API.** `ah_get_delivery_slots` lists the windows, but booking one, which starts the order, happens in the AH app or on ah.nl. While the order is active, AH doesn't serve the shopping list; the tools say so and point to the order tools.
- **Ticking off shopping-list items isn't supported:** the API returns no usable item IDs.
- **Bonus Box**, AH's personal weekly deals, is not available: its API is unknown.

## Development

```bash
git clone https://github.com/olekpuchka/albert-heijn-mcp
cd albert-heijn-mcp
npm ci
npm run build    # compile to dist/
npm run lint     # type-check
```

Run it from the checkout with `node dist/index.js`, or use `/path/to/albert-heijn-mcp/dist/index.js` as the argument in your client's config with `node` as the command.

| Path | Contents |
|---|---|
| [`src/index.ts`](src/index.ts), [`src/config.ts`](src/config.ts) | Entry point, flags and settings |
| [`src/ahapi/`](src/ahapi) | Client for AH's REST and GraphQL API, on Node's built-in `fetch` |
| [`src/auth/`](src/auth) | Login code exchange, token storage and refresh |
| [`src/server/`](src/server) | Streamable HTTP transport and token check |
| [`src/tools/`](src/tools) | The MCP tools, one file per area |
| [`deploy/`](deploy) | systemd unit, shipped in the package |
| [`listing/`](listing) | Name, descriptions and icon to use in connector settings and app directories ([how](listing/README.md)) |
| [`.github/`](.github) | CI, release workflow and Dependabot |
| [`assets/`](assets) | Logo for this README and the server icon shown by MCP clients |

The only runtime dependencies are the official [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) and Zod, which the SDK uses for tool schemas.

To call tools by hand, use the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Before deploying a change, run a quick check against a real account: log in, search for `melk`, add a product to your shopping list and remove it again, then view your cart and orders.

To release, set the new version in `package.json` and in both places in [`server.json`](server.json), merge it to `main`, and push a tag: `git tag v1.2.3 && git push origin v1.2.3`. The [release workflow](.github/workflows/release.yml) checks that the versions match, builds the package, attaches it to the GitHub release as `albert-heijn-mcp.tgz`, and stages it on npm through [trusted publishing](https://docs.npmjs.com/trusted-publishers), so no npm token is stored. Approve the staged version on npmjs.com (or with `npm stage approve`) to make it live; the workflow then updates the [MCP Registry](https://registry.modelcontextprotocol.io) entry.

## Troubleshooting

<details>
<summary><b>Login fails with "exchange code"</b></summary>

Codes work once and expire quickly. Ask to log in again and paste the new link straight away.
</details>

<details>
<summary><b>No "Failed to launch" line after logging in</b></summary>

Open the developer console before you submit the login form, or look for the `appie://login-exit?code=…` request in the Network tab. Browsers other than Chrome may show the link in an error page or dialog instead.
</details>

<details>
<summary><b>"Not logged in", or the session seems broken</b></summary>

Log out and back in through the assistant, or delete `tokens.json` from the [token location](#logging-in) and log in again.
</details>

<details>
<summary><b>"There is no active delivery order to change"</b></summary>

AH accepts order changes only once an order exists. Choose a delivery slot in the AH app or on ah.nl first.
</details>

<details>
<summary><b>"The shopping list is not available while a delivery order is active"</b></summary>

Choosing a slot moved your list into the order. Use `ah_get_cart` and `ah_update_cart_item` until the order is delivered or cancelled.
</details>

<details>
<summary><b>OAuth login opens at localhost, or the client can't reach it</b></summary>

Set `AH_MCP_BASE_URL` to the server's public `https://` URL and restart it. Clients are sent there to log in.
</details>

<details>
<summary><b>Port 3000 is in use</b></summary>

Set `AH_MCP_PORT` to another port, in the environment or `.env`.
</details>

## License

[Apache 2.0](LICENSE)
