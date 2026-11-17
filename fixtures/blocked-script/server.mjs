import { run } from "../_shared/app-server.mjs";
import { view } from "../_shared/view.mjs";

run({
  viewText: view({
    head: '<script src="https://esm.sh/preact@10"></script>',
  }),
});
