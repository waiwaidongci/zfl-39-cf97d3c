import http from "node:http";
import { send } from "./lib/db.js";
import { handleApi } from "./routes/api.js";
import { handlePages } from "./routes/pages.js";

const port = Number(process.env.PORT || 3039);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const method = req.method;

    if (handlePages(req, res, url)) return;

    const apiResult = await handleApi(req, res, url, method);
    if (apiResult !== null) return;

    send(res, 404, { error: "not_found" });
  } catch (error) {
    send(res, 500, { error: error.message });
  }
});

server.listen(port, () => console.log("古法纸浆发酵记录 listening on http://localhost:" + port));
