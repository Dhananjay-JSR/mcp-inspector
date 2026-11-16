import { run } from "../_shared/app-server.mjs";

run({
  ping: () => {
    throw new Error("ping is not implemented");
  },
});
