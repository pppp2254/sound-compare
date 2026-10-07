import { Elysia } from "elysia";
import { join, normalize } from "node:path";

const root = join(import.meta.dir, "../public");

const app = new Elysia()
  .get("/", () => Bun.file(join(root, "index.html")))
  .get("/*", ({ params, set }) => {
    const path = normalize(join(root, params["*"]));
    if (!path.startsWith(root)) {
      set.status = 404;
      return "Not found";
    }
    return Bun.file(path);
  })
  .listen(Number(process.env.PORT ?? 3000));

console.log(`Sound Compare preview on http://localhost:${app.server?.port}`);
