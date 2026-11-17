import { run } from "../_shared/app-server.mjs";
import { view } from "../_shared/view.mjs";

run({ viewText: view({ sizeChanges: 8 }) });
