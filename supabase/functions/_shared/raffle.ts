import { ApiError, corsHeaders, hashOrigin, readBody } from "./http.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Payload = { action: "lookup"; public_code: string; request_id: string } | {
  action: "enter";
  public_code: string;
  request_id: string;
  browser_id: string;
  name: string;
  accepted: true;
  terms_version: number;
};

function invalid() {
  return new ApiError(400, "INVALID_ENTRY", "Revisa los datos del sorteo.");
}

export function rafflePayload(body: Record<string, unknown>): Payload {
  const { action, public_code, request_id } = body;
  if (
    typeof public_code !== "string" || !/^[0-9a-f]{32}$/.test(public_code) ||
    typeof request_id !== "string" || !uuid.test(request_id)
  ) throw invalid();
  if (action === "lookup" && Object.keys(body).length === 3) {
    return { action, public_code, request_id };
  }
  const { browser_id, name, accepted, terms_version } = body;
  if (
    action !== "enter" || Object.keys(body).length !== 7 ||
    typeof browser_id !== "string" || !uuid.test(browser_id) ||
    typeof name !== "string" || accepted !== true ||
    typeof terms_version !== "number" || !Number.isInteger(terms_version) ||
    terms_version < 1 || terms_version > 2147483647
  ) throw invalid();
  const cleanName = name.trim();
  if (
    [...cleanName].length < 2 || [...cleanName].length > 60 ||
    /\p{Cc}/u.test(cleanName)
  ) throw invalid();
  return {
    action,
    public_code,
    request_id,
    browser_id,
    name: cleanName,
    accepted,
    terms_version,
  };
}

type RaffleRpc = (
  name: string,
  args: Record<string, unknown>,
) => PromiseLike<
  { data: unknown; error: { code: string; message: string } | null }
>;

const unavailable = () =>
  new ApiError(503, "UNAVAILABLE", "Sorteo no disponible temporalmente.");

function rpcFailure(error: { code: string; message: string }) {
  if (error.code === "PT400") return invalid();
  if (error.code === "PT404") {
    return new ApiError(404, "RAFFLE_NOT_AVAILABLE", "Sorteo no disponible.");
  }
  if (error.code === "PT429") {
    return new ApiError(429, "RAFFLE_RATE_LIMITED", "Espera un minuto.");
  }
  if (error.code === "PT409") {
    return error.message === "RAFFLE_TERMS_CHANGED"
      ? new ApiError(409, "RAFFLE_TERMS_CHANGED", "Revisa las condiciones.")
      : new ApiError(409, "RAFFLE_CLOSED", "Las inscripciones están cerradas.");
  }
  return unavailable();
}

function projectRaffle(
  data: unknown,
  action: Payload["action"],
): Record<string, unknown> {
  if (action === "lookup" && data === null) return { raffle: null };
  if (!data || typeof data !== "object") throw unavailable();
  const row = data as Record<string, unknown>;
  if (action === "enter") {
    if (row.status !== "ENTERED" && row.status !== "ALREADY_ENTERED") {
      throw unavailable();
    }
    return { status: row.status };
  }
  const { prize_name, description, terms, terms_version, closes_at } = row;
  if (
    typeof prize_name !== "string" || typeof description !== "string" ||
    typeof terms !== "string" || typeof terms_version !== "number" ||
    typeof closes_at !== "string"
  ) throw unavailable();
  return {
    raffle: { prize_name, description, terms, terms_version, closes_at },
  };
}

export async function handleRaffle(
  request: Request,
  rpc: RaffleRpc,
): Promise<Response> {
  let headers = new Headers({ Vary: "Origin", "Cache-Control": "no-store" });
  try {
    headers = corsHeaders(request);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "POST") {
      throw new ApiError(405, "METHOD_NOT_ALLOWED", "Utiliza POST.");
    }
    const body = rafflePayload(await readBody(request));
    const base = {
      p_code: body.public_code,
      p_request_id: body.request_id,
      p_origin_hash: await hashOrigin(request, body.public_code),
    };
    const { data, error } = body.action === "lookup"
      ? await rpc("lookup_public_raffle", base)
      : await rpc("enter_public_raffle", {
        ...base,
        p_browser_id: body.browser_id,
        p_name: body.name,
        p_accepted: body.accepted,
        p_terms_version: body.terms_version,
      });
    if (error) throw rpcFailure(error);
    return Response.json(projectRaffle(data, body.action), { headers });
  } catch (error) {
    const failure = error instanceof ApiError ? error : unavailable();
    if (failure.status === 429) headers.set("Retry-After", "60");
    return Response.json({ code: failure.code }, {
      status: failure.status,
      headers,
    });
  }
}
