import type { Env } from "../env";
import { mintToNftIdMap } from "../utils/mint-to-nft-id-map";
import { mintToRankMap } from "../utils/mint-to-rank-map";

export interface WebhookData {
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

export class WebhookService {
  constructor(private readonly env: Env) {}

  private formatSource(source: string): string {
    return source
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private async sendTelegramMessage(
    message: string,
    imageUrl: string,
  ): Promise<unknown> {
    const url = `https://api.telegram.org/bot${this.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: this.env.TELEGRAM_CHAT_ID,
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

  private async sendXPost(message: string, imageUrl: string): Promise<unknown> {
    console.log("Sending X post:", { message, imageUrl });

    const tokenResponse = await fetch(
      "https://api.twitter.com/2/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${btoa(
            `${this.env.X_APP_KEY}:${this.env.X_APP_SECRET}`,
          )}`,
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
        }),
      },
    );

    if (!tokenResponse.ok) {
      throw new Error(`Failed to get token: ${await tokenResponse.text()}`);
    }

    const { access_token } = (await tokenResponse.json()) as {
      access_token: string;
    };

    return access_token;
  }

  private formatMessage(
    nftId: number,
    rank: number,
    sourceString: string,
    amount: number,
    buyer: string,
    seller: string,
    signature: string,
  ): string {
    return `🎉 *Gecko #${nftId} - RANK ${rank} - collected on ${sourceString}*

*Price*: ${amount / 1e9} SOL
*Buyer*: \`${buyer}\`
*Seller*: \`${seller}\`
*Signature*: [View on Solscan](https://solscan.io/tx/${signature})`;
  }

  async processTransaction(transaction: WebhookData): Promise<void> {
    if (transaction.type !== "NFT_SALE" && transaction.type !== "SWAP") {
      return;
    }

    const { amount, buyer, seller, signature, nfts, source } =
      transaction.events.nft;

    const mint = nfts?.[0]?.mint;
    if (!mint) {
      console.log("No mint found in transaction");
      return;
    }

    const nftId = mintToNftIdMap[mint];
    const rank = mintToRankMap[mint];
    if (!nftId || !rank) {
      console.log("Missing nftId or rank for mint:", mint);
      return;
    }

    const imageUrl = `https://galacticgeckoz.nyc3.cdn.digitaloceanspaces.com/gecko-images/${nftId}.jpg`;
    const sourceString = this.formatSource(source);
    const message = this.formatMessage(
      nftId,
      rank,
      sourceString,
      amount,
      buyer,
      seller,
      signature,
    );

    console.log("Sending notifications...");

    if (transaction?.isTesting) {
      console.log("Skipping notifications for testing");
      return;
    }

    const results = await Promise.allSettled([
      this.sendTelegramMessage(message, imageUrl),
      // this.sendXPost(message, imageUrl),
    ]);

    results.forEach((result, index) => {
      const platform = index === 0 ? "Telegram" : "X";
      if (result.status === "fulfilled") {
        console.log(`${platform} notification sent:`, result.value);
      } else {
        console.error(`Error sending ${platform} notification:`, result.reason);
      }
    });
  }
}
