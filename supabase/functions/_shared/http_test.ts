import {
  ApiError,
  corsHeaders,
  handle,
  hashOrigin,
  readBody,
  validateBody,
} from "./http.ts";

function assert(
  condition: unknown,
  message = "Asercion fallida",
): asserts condition {
  if (!condition) throw new Error(message);
}

function request(body: string, headers: Record<string, string> = {}): Request {
  return new Request(
    "https://example.supabase.co/functions/v1/submit-song-request",
    {
      method: "POST",
      body,
      headers: { "content-type": "application/json", ...headers },
    },
  );
}

Deno.test("JSON limitado por bytes reales, tambien sin Content-Length", async () => {
  assert(
    (await readBody(request('{"public_code":"abc"}'))).public_code === "abc",
  );
  for (
    const body of [
      "[]",
      "null",
      "{",
      JSON.stringify({ text: "a".repeat(4096) }),
      JSON.stringify({ text: "🎵".repeat(1024) }),
    ]
  ) {
    try {
      await readBody(request(body));
      throw new Error("Debia rechazar el cuerpo");
    } catch (error) {
      assert(error instanceof ApiError && error.status === 400);
    }
  }
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(2048));
      controller.enqueue(new Uint8Array(2049));
      controller.close();
    },
  });
  try {
    await readBody(
      new Request("https://example.com", {
        method: "POST",
        body: stream,
        headers: { "content-type": "application/json" },
      }),
    );
    throw new Error("Debia limitar el stream");
  } catch (error) {
    assert(error instanceof ApiError && error.status === 400);
  }
});

Deno.test("Validacion estricta, trim y longitud Unicode", () => {
  const body = {
    public_code: "a".repeat(32),
    song_title: "  🎵🎵  ",
    artist: "  Artista  ",
    request_id: crypto.randomUUID(),
  };
  validateBody(body, true);
  assert(body.song_title === "🎵🎵" && body.artist === "Artista");
  for (
    const bad of [
      { ...body, status: "ATENDIDA" },
      { ...body, request_id: "no" },
      { ...body, song_title: "\t " },
      { ...body, artist: "a\nb" },
    ]
  ) {
    try {
      validateBody(bad, true);
      throw new Error("Debia rechazar los campos");
    } catch (error) {
      assert(error instanceof ApiError && error.code === "INVALID_INPUT");
    }
  }
});

Deno.test("CORS cerrado por defecto y whitelist exacta", async () => {
  Deno.env.delete("ALLOWED_ORIGINS");
  assert((await handle(request("{}"), false)).status === 503);
  Deno.env.set(
    "ALLOWED_ORIGINS",
    "https://pidebeat.example,http://localhost:5173",
  );
  assert(
    corsHeaders(request("{}", { origin: "https://pidebeat.example" })).get(
      "Access-Control-Allow-Origin",
    ) === "https://pidebeat.example",
  );
  const denied = await handle(
    request("{}", { origin: "https://pidebeat.example.attacker.test" }),
    false,
  );
  assert(
    denied.status === 400 && !denied.headers.has("Access-Control-Allow-Origin"),
  );
  const preflight = await handle(
    new Request("https://example.com", {
      method: "OPTIONS",
      headers: { origin: "https://pidebeat.example" },
    }),
    true,
  );
  assert(preflight.status === 204);
  Deno.env.delete("ALLOWED_ORIGINS");
});

Deno.test("HMAC por evento, IP canonica y fail closed sin cabecera confiable", async () => {
  Deno.env.set("REQUEST_ORIGIN_SECRET", "x".repeat(32));
  const hash = (ip: string, code = "a".repeat(32)) =>
    hashOrigin(request("{}", { "cf-connecting-ip": ip }), code);
  const first = await hash("192.0.2.1");
  assert(/^[a-f0-9]{64}$/.test(first));
  assert(first === await hash("::ffff:192.0.2.1"));
  assert(await hash("2001:db8::1") === await hash("2001:0db8:0:0:0:0:0:1"));
  assert(first !== await hash("192.0.2.1", "b".repeat(32)));
  for (const ip of ["", "192.0.2.1, 192.0.2.2", "forged", "192.0.2.1:1234"]) {
    try {
      await hash(ip);
      throw new Error("Debia rechazar la IP");
    } catch (error) {
      assert(error instanceof ApiError && error.status === 503);
    }
  }
  Deno.env.delete("REQUEST_ORIGIN_SECRET");
  try {
    await hash("192.0.2.1");
    throw new Error("Debia rechazar sin secreto");
  } catch (error) {
    assert(error instanceof ApiError && error.status === 503);
  }
});

Deno.test("Errores RPC traducidos sin revelar detalles y proyeccion publica", async () => {
  Deno.env.set("ALLOWED_ORIGINS", "https://pidebeat.example");
  Deno.env.set("REQUEST_ORIGIN_SECRET", "x".repeat(32));
  Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-only-not-a-secret");
  const original = globalThis.fetch;
  const body = JSON.stringify({
    public_code: "a".repeat(32),
    song_title: "Tema",
    artist: "Artista",
    request_id: crypto.randomUUID(),
  });
  try {
    for (
      const [code, message, status, expected] of [
        ["PT400", "INVALID_INPUT", 400, "INVALID_INPUT"],
        ["PT404", "EVENT_NOT_FOUND", 404, "EVENT_NOT_FOUND"],
        ["PT409", "EVENT_CLOSED", 409, "EVENT_CLOSED"],
        ["PT409", "IDEMPOTENCY_CONFLICT", 409, "IDEMPOTENCY_CONFLICT"],
        ["PT429", "RATE_LIMITED", 429, "RATE_LIMITED"],
        ["XX000", "sensitive internal details", 503, "UNAVAILABLE"],
      ] as const
    ) {
      globalThis.fetch = () =>
        Promise.resolve(Response.json({ code, message }, { status: 400 }));
      const response = await handle(
        request(body, { "cf-connecting-ip": "192.0.2.1" }),
        true,
      );
      const result = await response.json();
      assert(
        response.status === status && result.code === expected &&
          !result.error.includes("sensitive"),
      );
      if (status === 429) assert(response.headers.get("Retry-After") === "60");
    }
    globalThis.fetch = () => Promise.resolve(Response.json({ ok: true }));
    assert(
      (await (await handle(
        request(body, { "cf-connecting-ip": "192.0.2.1" }),
        true,
      )).json()).ok === true,
    );
    globalThis.fetch = () =>
      Promise.resolve(
        Response.json({
          name: "Fiesta",
          is_active: true,
          workspace_id: "hidden",
        }),
      );
    const result = await (await handle(
      request(JSON.stringify({ public_code: "a".repeat(32) })),
      false,
    )).json();
    assert(Object.keys(result).sort().join(",") === "is_active,name");
  } finally {
    globalThis.fetch = original;
    for (
      const key of [
        "ALLOWED_ORIGINS",
        "REQUEST_ORIGIN_SECRET",
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
      ]
    ) Deno.env.delete(key);
  }
});
