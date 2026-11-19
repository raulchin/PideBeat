import { handle } from "../_shared/http.ts";

Deno.serve((request: Request) => handle(request, false));
