import { createHmac, randomBytes } from "node:crypto";

// OAuth 1.0a signing, hand-rolled rather than pulling in a dependency — same call this
// codebase makes elsewhere (DK's httr2+cookie auth has no library either). Free-tier X
// API v2 posting uses OAuth 1.0a user-context, which needs no token refresh (unlike
// OAuth 2.0 user tokens, which expire in 2h) — important since this runs unattended in CI.

export interface XCreds {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

// RFC 3986 percent-encoding: encodeURIComponent leaves !*'() unescaped, which OAuth 1.0a's
// spec requires escaped (a well-known Node/.NET/most-languages gap versus the RFC).
function pctEncode(s: string): string {
  return encodeURIComponent(s).replace(/[!*'()]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function oauthHeader(method: string, url: string, creds: XCreds): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };
  const paramString = Object.keys(oauthParams)
    .sort()
    .map((k) => `${pctEncode(k)}=${pctEncode(oauthParams[k])}`)
    .join("&");
  const baseString = `${method}&${pctEncode(url)}&${pctEncode(paramString)}`;
  const signingKey = `${pctEncode(creds.apiSecret)}&${pctEncode(creds.accessTokenSecret)}`;
  const signature = createHmac("sha1", signingKey).update(baseString).digest("base64");
  const headerParams: Record<string, string> = { ...oauthParams, oauth_signature: signature };
  return (
    "OAuth " +
    Object.keys(headerParams)
      .sort()
      .map((k) => `${pctEncode(k)}="${pctEncode(headerParams[k])}"`)
      .join(", ")
  );
}

/** Read X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_TOKEN_SECRET from env.
 *  Returns null (not throws) when unset, so local/dev runs without the secrets configured
 *  silently skip posting — same convention as DK_COOKIE elsewhere in this pipeline. */
export function xCredsFromEnv(): XCreds | null {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;
  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) return null;
  return { apiKey, apiSecret, accessToken, accessTokenSecret };
}

export async function postTweet(text: string, creds: XCreds): Promise<string> {
  const url = "https://api.twitter.com/2/tweets";
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: oauthHeader("POST", url, creds), "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!resp.ok) throw new Error(`X post failed (${resp.status}): ${await resp.text()}`);
  const json = (await resp.json()) as { data: { id: string } };
  return json.data.id;
}
