import { run } from "../_shared/app-server.mjs";

run({ viewPath: new URL("./view.html", import.meta.url) });
