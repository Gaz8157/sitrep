/**
 * Custom Next.js server that proxies /api/* and /ws to bridge.py on port 5555
 */
import { createServer } from "node:http";
import httpProxy from "http-proxy";
const { createProxyServer } = httpProxy;
import next from "next";

const PORT = parseInt(process.env.PORT || "3001", 10);
const BRIDGE = "http://127.0.0.1:5555";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, port: PORT });
const handle = app.getRequestHandler();

const proxy = createProxyServer({ target: BRIDGE, ws: true, changeOrigin: true });

proxy.on("error", (err, req, res) => {
  console.error("[proxy]", err.message);
  if (res && "writeHead" in res && !res.headersSent) {
    res.writeHead(502);
    res.end("Bridge unreachable");
  }
});

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const url = req.url || "";
    if (url.startsWith("/api/") || url === "/api") {
      proxy.web(req, res);
    } else {
      handle(req, res);
    }
  });

  // Proxy WebSocket upgrade for /ws
  server.on("upgrade", (req, socket, head) => {
    if ((req.url || "").startsWith("/ws")) {
      proxy.ws(req, socket, head);
    } else {
      socket.destroy();
    }
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`> AI GM Dashboard ready on http://0.0.0.0:${PORT}`);
    console.log(`> Proxying /api/* and /ws → ${BRIDGE}`);
  });
});
