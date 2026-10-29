import { createHmac } from "node:crypto";

export type IceServer = { urls: string[]; username?: string; credential?: string };

/**
 * Short-lived TURN credentials using the TURN REST API scheme supported by coturn
 * (`use-auth-secret` / `static-auth-secret`): username = "<expiry>:<user>", credential =
 * base64(HMAC-SHA1(secret, username)). Provider-independent: works with any TURN server
 * that implements the scheme. Falls back to static credentials, then STUN only.
 */
export function turnCredentials(secret: string, userId: string, ttlSeconds = 3600, now = Date.now()) {
  const username = `${Math.floor(now / 1000) + ttlSeconds}:${userId}`;
  const credential = createHmac("sha1", secret).update(username).digest("base64");
  return { username, credential };
}

export function buildIceServers(
  env: { stunUrls: string[]; turnUrls: string[]; turnSecret: string; turnUsername: string; turnCredential: string },
  userId: string,
): IceServer[] {
  const servers: IceServer[] = [];
  if (env.stunUrls.length) servers.push({ urls: env.stunUrls });
  if (env.turnUrls.length) {
    if (env.turnSecret) servers.push({ urls: env.turnUrls, ...turnCredentials(env.turnSecret, userId) });
    else if (env.turnUsername && env.turnCredential) servers.push({ urls: env.turnUrls, username: env.turnUsername, credential: env.turnCredential });
  }
  return servers;
}
