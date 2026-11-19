// deno-lint-ignore no-import-prefix -- Import exacto compartido sin alias global de despliegue.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { isIP } from "node:net";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const unavailable = () =>
  new ApiError(
    503,
    "UNAVAILABLE",
    "Servicio no disponible. Intentalo de nuevo.",
  );
const invalid = () =>
  new ApiError(400, "INVALID_INPUT", "Revisa los datos enviados.");

export function corsHeaders(request: Request): Headers {
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) =>
    s.trim()
  ).filter(Boolean);
  if (
    !allowed.length || allowed.some((s) => s === "*" || new URL(s).origin !== s)
  ) throw unavailable();
  const origin = request.headers.get("origin");
  if (origin && !allowed.includes(origin)) {
    throw new ApiError(400, "ORIGIN_NOT_ALLOWED", "Origen no permitido.");
  }
  const headers = new Headers({
    "Vary": "Origin",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
  });
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

export async function readBody(
  request: Request,
): Promise<Record<string, unknown>> {
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
      "application/json" ||
    (request.headers.get("content-encoding") ?? "identity") !== "identity"
  ) throw invalid();
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > 4096)) {
    throw invalid();
  }
  if (!request.body) throw invalid();
  const reader = request.body.getReader();
  const bytes = new Uint8Array(4096);
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.byteLength > 4096) {
        await reader.cancel();
        throw invalid();
      }
      bytes.set(value, size);
      size += value.byteLength;
    }
    const result: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)),
    );
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw invalid();
    }
    return result as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw invalid();
  } finally {
    reader.releaseLock();
  }
}

export function validateBody(
  body: Record<string, unknown>,
  submit: boolean,
): void {
  const fields = submit
    ? ["public_code", "song_title", "artist", "request_id"]
    : ["public_code"];
  if (
    Object.keys(body).length !== fields.length ||
    fields.some((key) => typeof body[key] !== "string")
  ) throw invalid();
  if (!/^[0-9a-f]{32}$/.test(body.public_code as string)) throw invalid();
  if (!submit) return;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      body.request_id as string,
    )
  ) throw invalid();
  for (const key of ["song_title", "artist"]) {
    const value = (body[key] as string).trim();
    if (
      [...value].length < 2 || [...value].length > 120 ||
      /\p{Cc}/u.test(value)
    ) throw invalid();
    body[key] = value;
  }
}

export async function hashOrigin(
  request: Request,
  publicCode: string,
): Promise<string> {
  const secret = Deno.env.get("REQUEST_ORIGIN_SECRET") ?? "";
  const raw = request.headers.get("cf-connecting-ip") ?? "";
  if (new TextEncoder().encode(secret).length < 32 || !isIP(raw)) {
    throw unavailable();
  }
  // URL canoniza IPv6; IPv4 mapeada se agrupa con su equivalente IPv4.
  let ip = isIP(raw) === 6
    ? new URL(`http://[${raw}]/`).hostname.slice(1, -1)
    : raw;
  if (ip.startsWith("::ffff:")) {
    const parts = ip.slice(7).split(":");
    if (parts.length === 2) {
      const value = Number.parseInt(parts[0], 16) * 65536 +
        Number.parseInt(parts[1], 16);
      ip = [
        value >>> 24,
        (value >>> 16) & 255,
        (value >>> 8) & 255,
        value & 255,
      ].join(".");
    }
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`pidebeat:v1:${publicCode}:${ip}`),
  );
  return [...new Uint8Array(signature)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

const sqlErrors: Record<string, [number, string, string]> = {
  PT400: [400, "INVALID_INPUT", "Revisa los datos enviados."],
  PT404: [404, "EVENT_NOT_FOUND", "El evento no existe."],
  PT429: [
    429,
    "RATE_LIMITED",
    "Limite de solicitudes alcanzado. Espera un minuto.",
  ],
};

export async function handle(
  request: Request,
  submit: boolean,
): Promise<Response> {
  let headers = new Headers({ "Vary": "Origin", "Cache-Control": "no-store" });
  try {
    headers = corsHeaders(request);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "POST") {
      throw new ApiError(400, "METHOD_NOT_ALLOWED", "Utiliza POST.");
    }
    const body = await readBody(request);
    validateBody(body, submit);
    const originHash = submit
      ? await hashOrigin(request, body.public_code as string)
      : null;
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw unavailable();
    const client = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
      },
    });
    const { data, error } = submit
      ? await client.rpc("submit_public_song_request", {
        p_public_code: body.public_code,
        p_song_title: body.song_title,
        p_artist: body.artist,
        p_request_id: body.request_id,
        p_origin_hash: originHash,
      })
      : await client.rpc("lookup_public_event", {
        p_public_code: body.public_code,
      });
    if (error) {
      if (error.code === "PT409") {
        const closed = error.message === "EVENT_CLOSED";
        throw new ApiError(
          409,
          closed ? "EVENT_CLOSED" : "IDEMPOTENCY_CONFLICT",
          closed
            ? "El evento esta cerrado."
            : "Este identificador ya se uso para otra solicitud.",
        );
      }
      const known = sqlErrors[error.code];
      if (known) throw new ApiError(...known);
      throw unavailable();
    }
    if (
      !data || (submit && data.ok !== true) ||
      (!submit &&
        (typeof data.name !== "string" || typeof data.is_active !== "boolean"))
    ) throw unavailable();
    return Response.json(
      submit ? { ok: true } : { name: data.name, is_active: data.is_active },
      { headers },
    );
  } catch (error) {
    const failure = error instanceof ApiError ? error : unavailable();
    if (failure.status === 429) headers.set("Retry-After", "60");
    return Response.json({ error: failure.message, code: failure.code }, {
      status: failure.status,
      headers,
    });
  }
}
