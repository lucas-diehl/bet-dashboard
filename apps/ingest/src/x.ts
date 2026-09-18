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

// `bodyParams`: OAuth 1.0a requires application/x-www-form-urlencoded body params to be
// folded INTO the signature (unlike a JSON body, which is never signed) — needed for
// account/update_profile.json below, not for the JSON tweet-posting call.
function oauthHeader(method: string, url: string, creds: XCreds, bodyParams: Record<string, string> = {}): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };
  const signedParams = { ...oauthParams, ...bodyParams };
  const paramString = Object.keys(signedParams)
    .sort()
    .map((k) => `${pctEncode(k)}=${pctEncode(signedParams[k])}`)
    .join("&");
  const baseString = `${method}&${pctEncode(url)}&${pctEncode(paramString)}`;
  const signingKey = `${pctEncode(creds.apiSecret)}&${pctEncode(creds.accessTokenSecret)}`;
  const signature = createHmac("sha1", signingKey).update(baseString).digest("base64");
  // only oauth_* params (+ the signature) go in the header — bodyParams travel in the
  // actual request body, they're only folded into the signature computation above.
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

/** Thrown when X rejects a post as byte-identical to one we already sent (403,
 *  "duplicate content"). Distinct from every other failure: a duplicate means the
 *  content was already successfully communicated, so callers should treat it as
 *  success (mark tweeted, move on) rather than retry — retrying identical text would
 *  just get the identical rejection forever, stalling that batch permanently. This is
 *  most likely to bite two consecutive results tweets that round to the exact same
 *  terse summary text (e.g. the same W-L/units line twice), not picks (which vary). */
export class DuplicateTweetError extends Error {}

export async function postTweet(text: string, creds: XCreds, replyToId?: string): Promise<string> {
  const url = "https://api.twitter.com/2/tweets";
  const body: { text: string; reply?: { in_reply_to_tweet_id: string } } = { text };
  if (replyToId) body.reply = { in_reply_to_tweet_id: replyToId };
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: oauthHeader("POST", url, creds), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const detail = await resp.text();
    if (resp.status === 403 && detail.includes("duplicate content")) throw new DuplicateTweetError(detail);
    throw new Error(`X post failed (${resp.status}): ${detail}`);
  }
  const json = (await resp.json()) as { data: { id: string } };
  return json.data.id;
}

/** Post a sequence of tweets as one thread — each replies to the one before it. One API
 *  call per part, so a long thread costs proportionally more credits than a single tweet
 *  (see formatPicksThread in format-tweet.ts). Stops and throws on the first failure —
 *  a partial thread with a missing middle tweet is worse than not posting the rest. */
export async function postThread(parts: string[], creds: XCreds): Promise<string[]> {
  const ids: string[] = [];
  let replyTo: string | undefined;
  for (const part of parts) {
    try {
      const id = await postTweet(part, creds, replyTo);
      ids.push(id);
      replyTo = id;
    } catch (e) {
      if (!(e instanceof DuplicateTweetError)) throw e;
      // Already posted verbatim before — can't recover its id to chain the next reply
      // to it specifically, so the next part chains onto the last tweet we DO have an
      // id for instead. Rare (thread parts vary with the picks), worth not blocking on.
      console.warn("Duplicate content in thread part — already posted, continuing:", part.slice(0, 60));
    }
  }
  return ids;
}

/** Overwrite the account bio. This is a v1.1 endpoint (X's v2 API has no general
 *  profile-update route yet) — still works with the same OAuth 1.0a user-context creds.
 *  X's bio field caps at 160 chars; callers should keep formatBio() under that. */
export async function updateBio(description: string, creds: XCreds): Promise<void> {
  const url = "https://api.twitter.com/1.1/account/update_profile.json";
  const params = { description };
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: oauthHeader("POST", url, creds, params),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  if (!resp.ok) throw new Error(`X bio update failed (${resp.status}): ${await resp.text()}`);
}
