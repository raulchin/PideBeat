import { deepStrictEqual as assertEquals } from "node:assert/strict";
import { handleRaffle } from "./raffle.ts";

const code = "a".repeat(32);
const requestId = "10000000-0000-4000-8000-000000000001";
const browserId = "20000000-0000-4000-8000-000000000001";
const origin = "https://pidebeat.example";
const lookup = { action: "lookup", public_code: code, request_id: requestId };
const enter = {
  ...lookup,
  action: "enter",
  browser_id: browserId,
  name: "  DJ Luna  ",
  accepted: true,
  terms_version: 2,
};

function permissions(test: () => Promise<void>) {
  return async () => {
    const names = ["ALLOWED_ORIGINS", "REQUEST_ORIGIN_SECRET"];
    const previous = names.map((name) => Deno.env.get(name));
    Deno.env.set(names[0], origin);
    Deno.env.set(names[1], "x".repeat(32));
    try {
      await test();
    } finally {
      names.forEach((name, index) => {
        const value = previous[index];
        if (value === undefined) Deno.env.delete(name);
        else Deno.env.set(name, value);
      });
    }
  };
}

function post(body: object, ip = "192.0.2.10") {
  return new Request("https://edge.example/raffle", {
    method: "POST",
    headers: {
      origin,
      "Content-Type": "application/json",
      ...(ip ? { "cf-connecting-ip": ip } : {}),
    },
    body: JSON.stringify(body),
  });
}

Deno.test(
  "Sorteos exige recibo, consentimiento y origen válido antes de llamar a SQL",
  permissions(async () => {
    for (
      const [body, ip, status] of [
        [{ ...enter, accepted: false }, "192.0.2.10", 400],
        [{ ...enter, receipt: requestId }, "192.0.2.10", 400],
        [{ ...lookup, request_id: "" }, "192.0.2.10", 400],
        [enter, "", 503],
      ] as const
    ) {
      let calls = 0;
      const result = await handleRaffle(post(body, ip), () => {
        calls++;
        return Promise.resolve({ data: null, error: null });
      });
      assertEquals(result.status, status);
      assertEquals(calls, 0);
      assertEquals(result.headers.get("access-control-allow-origin"), origin);
    }
  }),
);

Deno.test(
  "Sorteos proyecta solo campos públicos y permite un sorteo no disponible",
  permissions(async () => {
    const expected = {
      prize_name: "Premio",
      description: "",
      terms: "Condiciones",
      terms_version: 1,
      closes_at: "2026-11-24T21:00:00Z",
    };
    const result = await handleRaffle(post(lookup), (name, args) => {
      assertEquals(name, "lookup_public_raffle");
      assertEquals(args.p_request_id, requestId);
      assertEquals(Object.keys(args).sort(), [
        "p_code",
        "p_origin_hash",
        "p_request_id",
      ]);
      return Promise.resolve({
        data: { ...expected, event_id: "privado" },
        error: null,
      });
    });
    assertEquals(await result.json(), { raffle: expected });
    const blank = await handleRaffle(
      post(lookup),
      () => Promise.resolve({ data: null, error: null }),
    );
    assertEquals(await blank.json(), { raffle: null });
  }),
);

Deno.test(
  "Sorteos trata el reintento como único y limita solicitudes sin revelar el error SQL",
  permissions(async () => {
    const result = await handleRaffle(post(enter), (name, args) => {
      assertEquals(name, "enter_public_raffle");
      assertEquals(args.p_name, "DJ Luna");
      assertEquals(args.p_accepted, true);
      return Promise.resolve({
        data: { status: "ALREADY_ENTERED" },
        error: null,
      });
    });
    assertEquals(await result.json(), { status: "ALREADY_ENTERED" });
    const limited = await handleRaffle(
      post(enter),
      () =>
        Promise.resolve({
          data: null,
          error: { code: "PT429", message: "interno" },
        }),
    );
    assertEquals(limited.status, 429);
    assertEquals(limited.headers.get("Retry-After"), "60");
    assertEquals(await limited.json(), { code: "RAFFLE_RATE_LIMITED" });
  }),
);
