// Ejecutar solo en una base desechable con las migraciones aplicadas.
const database = Deno.env.get("TEST_DATABASE_URL");
if (!database) {
  throw new Error("Falta TEST_DATABASE_URL de una base de pruebas.");
}
const decoder = new TextDecoder();

async function sql(query: string, expected?: string) {
  const result = await new Deno.Command("psql", {
    args: [database!, "-XqAt", "-v", "ON_ERROR_STOP=1", "-c", query],
  }).output();
  const error = decoder.decode(result.stderr);
  if (
    expected ? result.success || !error.includes(expected) : !result.success
  ) {
    throw new Error(error || `Se esperaba: ${expected}`);
  }
  return decoder.decode(result.stdout).trim();
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("Sorteos serializa inscripciones, cierre y elección del ganador", async () => {
  const user = crypto.randomUUID();
  const event = crypto.randomUUID();
  const code = crypto.randomUUID().replaceAll("-", "");
  const origin = "a".repeat(64);
  const receipt = crypto.randomUUID();
  const lateReceipt = crypto.randomUUID();
  const browser = crypto.randomUUID();
  const name = `raffle_${code}`;
  let workspace = "";
  const owner = `set role authenticated; set request.jwt.claim.sub='${user}';`;
  const enter = (id: string, device: string) =>
    `set role service_role; select public.enter_public_raffle('${code}','${id}','${origin}','${device}','Luna',true,1);`;
  try {
    await sql(`insert into auth.users(id) values('${user}')`);
    workspace = await sql(
      `${owner} select public.ensure_personal_workspace();`,
    );
    await sql(
      `insert into public.events(id,workspace_id,name,public_code) values('${event}','${workspace}','Sorteo de prueba','${code}')`,
    );
    await sql(
      `${owner} select public.save_raffle('${event}','Premio','','Bases',now()+interval '1 hour');
      select public.activate_raffle('${event}');`,
    );
    await sql(`set role service_role;
      select public.submit_public_song_request('${code}','Tema','Artista','${receipt}','${origin}');
      select public.submit_public_song_request('${code}','Tema 2','Artista','${lateReceipt}','${origin}');`);
    const retries = await Promise.all(
      Array.from({ length: 8 }, () => sql(enter(receipt, browser))),
    );
    assert(
      retries.filter((row) => row.includes('"ENTERED"')).length === 1,
      "Inscripción duplicada.",
    );

    const close = sql(`begin; ${owner} set application_name='${name}';
      select public.close_raffle('${event}'); select pg_sleep(1); commit;`);
    let locked = false;
    for (let i = 0; i < 100; i++) {
      if (
        await sql(
          `select count(*) from pg_stat_activity where application_name='${name}' and wait_event='PgSleep'`,
        ) === "1"
      ) {
        locked = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await Promise.all([
      close,
      locked
        ? sql(enter(lateReceipt, crypto.randomUUID()), "RAFFLE_CLOSED")
        : Promise.reject(new Error("No se observó el cierre con su bloqueo.")),
    ]);

    const draws = await Promise.all(
      Array.from({ length: 8 }, () =>
        sql(
          `${owner} select row_to_json(d) from public.draw_raffle('${event}') d;`,
        )),
    );
    assert(
      new Set(draws).size === 1,
      "El ganador cambió en un reintento simultáneo.",
    );
    assert(
      JSON.parse(draws[0]).eligible_count === 1,
      "El cierre no congeló la población elegible.",
    );
  } finally {
    if (workspace) {
      await sql(`delete from public.workspaces where id='${workspace}'`);
    }
    await sql(`delete from auth.users where id='${user}'`);
  }
});
