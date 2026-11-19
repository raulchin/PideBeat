// Ejecutar exclusivamente contra una base de pruebas con la migracion aplicada.
const database = Deno.env.get("TEST_DATABASE_URL");
if (!database) {
  throw new Error("Falta TEST_DATABASE_URL de una base de pruebas");
}
const decoder = new TextDecoder();

async function sql(query: string, expectedError?: string): Promise<string> {
  const result = await new Deno.Command("psql", {
    args: [database!, "-XqAt", "-v", "ON_ERROR_STOP=1", "-c", query],
    stdout: "piped",
    stderr: "piped",
  }).output();
  const error = decoder.decode(result.stderr);
  if (expectedError) {
    if (result.success || !error.includes(expectedError)) {
      throw new Error(`Error esperado: ${expectedError}; recibido: ${error}`);
    }
  } else if (!result.success) throw new Error(error);
  return decoder.decode(result.stdout).trim();
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const user = crypto.randomUUID();
const code = crypto.randomUUID().replaceAll("-", "");
const requestId = crypto.randomUUID();
const origin = "a".repeat(64);
const auth =
  `set local role authenticated; set local request.jwt.claim.sub='${user}';`;
const submit = (id: string) =>
  `select public.submit_public_song_request('${code}','Tema','Artista','${id}','${origin}')`;

// pg_stat_activity permite esperar un bloqueo real, sin depender de sleeps de JS.
async function waitForSession(name: string) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (
      await sql(
        `select count(*) from pg_stat_activity where application_name='${name}' and wait_event='PgSleep'`,
      ) === "1"
    ) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`No se observo la sesion ${name}`);
}

Deno.test("Concurrencia real: workspace, idempotencia, cuota y cierre", async () => {
  let workspace: string | undefined;
  try {
    await sql(`insert into auth.users(id) values('${user}')`);
    const provision = () =>
      sql(`begin; ${auth} select public.ensure_personal_workspace(); commit;`);
    const workspaces = await Promise.all(Array.from({ length: 8 }, provision));
    assert(
      new Set(workspaces).size === 1,
      "Aprovisionamiento concurrente duplicado",
    );
    workspace = workspaces[0];
    await sql(
      `insert into public.events(workspace_id,name,public_code) values('${workspace}','Concurrencia','${code}')`,
    );
    const duplicates = await Promise.all(
      Array.from(
        { length: 8 },
        () => sql(`set role service_role; ${submit(requestId)}`),
      ),
    );
    assert(
      duplicates.every((value) => value === '{"ok": true}'),
      "Reintento concurrente fallo",
    );
    assert(
      await sql(
        `select count(*) from public.song_requests where event_id=(select id from public.events where public_code='${code}')`,
      ) === "1",
      "Idempotencia concurrente duplicada",
    );
    const burst = await Promise.all(Array.from({ length: 8 }, async () => {
      try {
        await sql(`set role service_role; ${submit(crypto.randomUUID())}`);
        return true;
      } catch (error) {
        if (
          !(error instanceof Error) || !error.message.includes("RATE_LIMITED")
        ) throw error;
        return false;
      }
    }));
    assert(burst.filter(Boolean).length === 2, "Cuota concurrente excedida");
    await sql(
      `delete from private.request_receipts where event_id=(select id from public.events where public_code='${code}')`,
    );
    await sql(`set role service_role;
      select public.submit_public_song_request('${code}','Tema','Artista',gen_random_uuid(),lpad(to_hex(i),64,'0'))
      from generate_series(1,119) i;`);
    const aggregateBurst = await Promise.all(
      Array.from({ length: 8 }, async () => {
        try {
          await sql(`set role service_role; ${submit(crypto.randomUUID())}`);
          return true;
        } catch (error) {
          if (
            !(error instanceof Error) || !error.message.includes("RATE_LIMITED")
          ) throw error;
          return false;
        }
      }),
    );
    assert(
      aggregateBurst.filter(Boolean).length === 1,
      "Cuota agregada concurrente excedida",
    );
    await sql(
      `delete from private.request_receipts where event_id=(select id from public.events where public_code='${code}')`,
    );
    const beforeClose = sql(
      `begin; set application_name='pidebeat_submit_${code}'; set local role service_role;
      ${submit(crypto.randomUUID())}; select pg_sleep(1); commit;`,
    );
    await waitForSession(`pidebeat_submit_${code}`);
    const close = sql(
      `begin; ${auth} select public.close_event((select id from public.events where public_code='${code}')); commit;`,
    );
    await Promise.all([beforeClose, close]);
    assert(
      await sql(
        `select is_active from public.events where public_code='${code}'`,
      ) === "f",
      "Cierre no persistido",
    );
    await sql(
      `set role service_role; ${submit(crypto.randomUUID())}`,
      "EVENT_CLOSED",
    );

    // Segundo orden: cierre sin confirmar primero, envio esperando el mismo lock.
    await sql(
      `update public.events set is_active=true,closed_at=null where public_code='${code}'`,
    );
    const closing = sql(
      `begin; set application_name='pidebeat_close_${code}'; ${auth}
      select public.close_event((select id from public.events where public_code='${code}')); select pg_sleep(1); commit;`,
    );
    await waitForSession(`pidebeat_close_${code}`);
    const afterClose = sql(
      `set role service_role; ${submit(crypto.randomUUID())}`,
      "EVENT_CLOSED",
    );
    await Promise.all([closing, afterClose]);
  } finally {
    if (workspace) {
      await sql(`delete from public.workspaces where id='${workspace}'`);
    }
    await sql(`delete from auth.users where id='${user}'`);
  }
});
