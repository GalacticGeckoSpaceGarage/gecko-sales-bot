import { Hono } from "hono";
import { mintToNftIdMap } from "./utils/mint-to-nft-id-map";
import { mintToRankMap } from "./utils/mint-to-rank-map";

type Env = {
  HELIUS_API_KEY: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  AUTH_TOKEN: string;
};

const app = new Hono<{ Bindings: Env }>();

interface WebhookData {
  type: string;
  events: {
    nft: {
      amount: number;
      buyer: string;
      seller: string;
      signature: string;
      nfts: {
        mint: string;
        tokenStandard: string;
      }[];
      source: string;
    };
  };
  isTesting?: boolean;
}

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

async function sendTelegramMessage(
  message: string,
  env: Env,
  imageUrl: string,
) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "Markdown",
      link_preview_options: {
        url: imageUrl,
        show_above_text: true,
      },
    }),
  });
  return response.json();
}

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

  for (const transaction of data) {
    if (transaction.type === "NFT_SALE" || transaction.type === "SWAP") {
      const { amount, buyer, seller, signature, nfts, source } =
        transaction.events.nft;

      const mint = nfts?.[0]?.mint;
      if (!mint) {
        console.log("No mint found in transaction");
        continue;
      }

      const nftId = mintToNftIdMap[mint];
      if (!nftId) {
        console.log("No nftId found in transaction");
        continue;
      }

      const imageUrl = `https://galacticgeckoz.nyc3.cdn.digitaloceanspaces.com/gecko-images/${nftId}.jpg`;
      if (!imageUrl) {
        console.log("No imageUrl found in transaction");
        continue;
      }

      const rank = mintToRankMap[mint];
      if (!rank) {
        console.log("No rank found in transaction");
        continue;
      }

      const sourceString = source
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
      if (!sourceString) {
        console.log("No sourceString found in transaction");
        continue;
      }

      const message = `🎉 *Gecko #${nftId} - RANK ${rank} - collected on ${sourceString}*

*Price*: ${amount / 1e9} SOL
*Buyer*: \`${buyer}\`
*Seller*: \`${seller}\`
*Signature*: [View on Solscan](https://solscan.io/tx/${signature})`;

      console.log("Sending Telegram message:", message);

      if (transaction?.isTesting) {
        console.log("Skipping Telegram message for testing");
        continue;
      }

      try {
        const result = await sendTelegramMessage(message, c.env, imageUrl);
        console.log("Telegram message sent:", result);
      } catch (error) {
        console.error("Error sending Telegram message:", error);
      }
    }
  }

  return c.text("Webhook processed");
});

export default app;
