import { run } from "../_shared/app-server.mjs";
import { view } from "../_shared/view.mjs";

run({ viewText: view({ initialize: false, after: 'throw new Error("boom");' }) });
