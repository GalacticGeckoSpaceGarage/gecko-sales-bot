import { Hono } from "hono";
import type { Env } from "./env";
import { type WebhookData, WebhookService } from "./services/webhook.service";
import { mintToNftIdMap } from "./utils/mint-to-nft-id-map";

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => c.text("Solana Action Bot is running!"));

app.post("/create-webhook", async (c) => {
  const authToken = c.req.header("Authorization");
  if (authToken !== c.env.AUTH_TOKEN) {
    return c.text("Unauthorized", 401);
  }

  const webhookURL = `${new URL(c.req.url).origin}/webhook`;
  console.log("Setting up webhook with URL:", webhookURL);

  const mintAddresses = Object.keys(mintToNftIdMap);

  const response = await fetch(
    `https://api.helius.xyz/v0/webhooks?api-key=${c.env.HELIUS_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        webhookURL: webhookURL,
        transactionTypes: ["NFT_SALE", "SWAP"],
        accountAddresses: mintAddresses,
        webhookType: "enhanced",
        authHeader: c.env.AUTH_TOKEN,
      }),
    },
  );
  const data = await response.json();
  console.log("Helius webhook setup response:", data);
  return c.json({ success: true, webhook: data, webhookURL: webhookURL });
});

app.post("/webhook", async (c) => {
  const authToken = c.req.header("Authorization");
  if (authToken !== c.env.AUTH_TOKEN) {
    return c.text("Unauthorized", 401);
  }

  let data: WebhookData[];
  try {
    data = await c.req.json();
    console.log("Received webhook data:", data);
  } catch (error) {
    console.error("Error parsing webhook data:", error);
    return c.text("Error processing webhook", 400);
  }

  if (!Array.isArray(data) || data.length === 0) {
    console.log("No transactions in webhook data");
    return c.text("No transactions to process", 200);
  }

  const webhookService = new WebhookService(c.env);

  for (const transaction of data) {
    try {
      await webhookService.processTransaction(transaction);
    } catch (error) {
      console.error("Error processing transaction:", error);
    }
  }

  return c.text("Webhook processed");
});

export default app;
