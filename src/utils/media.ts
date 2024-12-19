import type { Readable } from "node:stream";
import type { EUploadMimeType } from "twitter-api-v2";

export * as Media from "./media";

export interface Output {
  buffer: Buffer;
  mimeType: EUploadMimeType;
}

export const fromUrl = async (input: {
  url: string;
}): Promise<Output> => {
  const response = await fetch(input.url);

  if (!response.ok) {
    throw new Error("Failed to fetch media from url.");
  }

  const buffer = (await streamToBuffer({
    readableStream: response.body as unknown as Readable,
  })) as Buffer;

  const mimeType = (response.headers.get("content-type") ||
    "unknown") as EUploadMimeType;

  return {
    buffer,
    mimeType,
  };
};

export const streamToBuffer = async (input: {
  readableStream: Readable;
}) => {
  // Check if it's a traditional Node.js stream
  if (typeof input.readableStream.on === "function") {
    return new Promise((resolve, reject) => {
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      const chunks: any[] = [];
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      input.readableStream.on("data", (chunk: any) => chunks.push(chunk));
      input.readableStream.on("error", reject);
      input.readableStream.on("end", () => resolve(Buffer.concat(chunks)));
    });
  }
  // Handle async iterators like undici response body

  const chunks: Uint8Array[] = [];
  for await (const chunk of input.readableStream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};
