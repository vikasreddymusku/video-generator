import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { ClientError, publicAddress, validateUrl } from "../security";
import { resolveSourceUrl } from "../../automation/source-loader";
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
export async function safeDownload(
  reference: string,
): Promise<{ bytes: Buffer; mime: string; url: string }> {
  let url = resolveSourceUrl(validateUrl(reference).href);
  const deadline = Date.now() + 20000;
  for (let redirects = 0; redirects <= 4; redirects++) {
    validateUrl(url.href);
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new ClientError("Source download timed out.");
    let timer: NodeJS.Timeout | undefined;
    const addresses = await Promise.race([
      lookup(url.hostname, { all: true }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new ClientError("Source DNS lookup timed out.")),
          remaining,
        );
      }),
    ]).finally(() => clearTimeout(timer));
    if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
      throw new ClientError(
        "Local and private network sources are not allowed.",
      );
    // Pin the verified address in the actual connection; redirects are checked again.
    const result = await new Promise<{
      bytes: Buffer;
      mime: string;
      location?: string;
    }>((resolve, reject) => {
      const req = request(
        url,
        {
          method: "GET",
          family: addresses[0].family,
          headers: {
            Accept:
              "text/markdown, text/plain, text/html, application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "Accept-Encoding": "identity",
          },
          lookup: (_host, _options, callback) =>
            callback(null, addresses[0].address, addresses[0].family),
        },
        (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode ?? 0)) {
            res.destroy();
            resolve({
              bytes: Buffer.alloc(0),
              mime: "",
              location: res.headers.location,
            });
            return;
          }
          if (res.statusCode !== 200) {
            res.destroy();
            reject(new ClientError(`Source returned HTTP ${res.statusCode}.`));
            return;
          }
          if (
            Number(res.headers["content-length"]) > MAX_SOURCE_BYTES ||
            (res.headers["content-encoding"] &&
              res.headers["content-encoding"] !== "identity")
          ) {
            res.destroy();
            reject(
              new ClientError(
                "Source exceeds the size limit or uses unsupported compression.",
              ),
            );
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on("data", (chunk) => {
            size += chunk.length;
            if (size > MAX_SOURCE_BYTES) {
              res.destroy(new ClientError("Source exceeds 20 MB."));
            } else chunks.push(chunk);
          });
          res.on("error", reject);
          res.on("end", () =>
            resolve({
              bytes: Buffer.concat(chunks),
              mime: (res.headers["content-type"] ?? "")
                .split(";")[0]
                .toLowerCase(),
            }),
          );
        },
      );
      const timeout = setTimeout(
        () => req.destroy(new ClientError("Source download timed out.")),
        Math.max(1, deadline - Date.now()),
      );
      req.on("close", () => clearTimeout(timeout));
      req.on("error", reject);
      req.end();
    });
    if (result.location) {
      url = resolveSourceUrl(new URL(result.location, url).href);
      continue;
    }
    if (!result.bytes.length)
      throw new ClientError("The source is empty or has an invalid redirect.");
    return { ...result, url: url.href };
  }
  throw new ClientError("Source has too many redirects.");
}
