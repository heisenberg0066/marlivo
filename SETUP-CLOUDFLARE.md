# Turning on online play (Cloudflare), step by step

Practice against bots already works with no server at all. To play **online with friends** you need the free
MarLivo server running on Cloudflare. Everything is ready in this repo; only you can create the account.
It costs nothing (Cloudflare's free plan is plenty for a group of friends).

**Time needed: about 10 minutes.**

## What I need from you

1. A **Cloudflare account** (free): https://dash.cloudflare.com/sign-up
2. A **Cloudflare API token** that can deploy Workers, plus your **Account ID**.
3. Two secret words you choose yourself:
   - **Friends key**: your friends type this once to create rooms. Example: `pumpkin-tea-2026`.
   - **Owner key**: only for you, to open Test rooms with the debug tools. Make it different and longer.

## Step 1: create the account
Sign up at https://dash.cloudflare.com/sign-up and confirm your email. No credit card needed.

## Step 2: make the API token
1. Go to https://dash.cloudflare.com/profile/api-tokens and click **Create Token**.
2. Pick the template **"Edit Cloudflare Workers"** and click **Use template**.
3. Under *Account Resources* choose your account; under *Zone Resources* choose **All zones** (or leave the default).
4. Click **Continue to summary**, then **Create Token**, and copy the token (you only see it once).
5. Your **Account ID** is on the right side of https://dash.cloudflare.com (Workers & Pages → Overview), or in the URL after `dash.cloudflare.com/`.

## Step 3: put four secrets into GitHub
Open https://github.com/heisenberg0066/marlivo/settings/secrets/actions and click **New repository secret** four times:

| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | the token from step 2 |
| `CLOUDFLARE_ACCOUNT_ID` | your account ID |
| `MARLIVO_FRIENDS_KEY` | your friends key |
| `MARLIVO_OWNER_KEY` | your owner key |

Then open https://github.com/heisenberg0066/marlivo/actions, choose **Test and deploy**, click **Run workflow**.
The `server` job deploys the Worker and stores both keys as Cloudflare secrets (they never appear in the code).

## Step 4: tell the app where the server is
1. In the finished `server` job log, find the line with the address, like
   `https://marlivo.<your-subdomain>.workers.dev`.
   (First time only: Cloudflare may ask you to pick a free `workers.dev` subdomain under Workers & Pages.)
2. Open https://github.com/heisenberg0066/marlivo/settings/variables/actions, click **New repository variable**:
   name `MARLIVO_SERVER_URL`, value that address (no slash at the end).
3. Run the **Test and deploy** workflow once more. The home page now says **"Online server connected"**, and
   *Create room* / *Join room* work.

Check: opening `https://marlivo.<your-subdomain>.workers.dev/api/health` should show
`{"ok":true,"app":"marlivo","friendsKeySet":true,"ownerKeySet":true}`.

## Doing it from a computer instead (optional)
If you prefer the command line (Node 22+):
```bash
cd apps/server
npx wrangler login                 # opens the browser once
npx wrangler deploy
npx wrangler secret put FRIENDS_KEY
npx wrangler secret put OWNER_KEY
```
Then do step 4.

## Good to know
- **Free plan limits**: Durable Objects on the free plan (SQLite storage) are far above what a friends group uses.
- **Privacy**: rooms are only created with the friends key; joining can also need a room password.
  Every player's screen only ever receives what that player may see (no hidden card values are sent).
- **No timers**: if someone's connection drops, the game pauses and waits for them, as long as it takes.
  As host you can replace them with a bot, remove them, or end the game.
- Rooms with nobody connected for 7 days are cleaned up automatically (housekeeping, not a game timer).
- To change a key later: replace the GitHub secret and re-run the workflow (or `npx wrangler secret put ...`).
