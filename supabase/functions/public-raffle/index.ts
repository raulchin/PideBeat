// deno-lint-ignore no-import-prefix -- Misma versión que las funciones musicales.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { handleRaffle } from "../_shared/raffle.ts";

Deno.serve((request) =>
  handleRaffle(request, (name, args) => {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Configuración incompleta.");
    return createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(8000) }),
      },
    }).rpc(name, args);
  })
);
