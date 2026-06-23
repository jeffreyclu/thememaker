/**
 * A tiny zero-dependency static file server for the e2e fixtures.
 *
 * Why not `file://`? The extension's content script (and the engine) gate on
 * `location.origin` being a real http(s) origin — a `file://` URL reports an
 * opaque/`"null"` origin, so the always-on content script BAILS and per-site
 * persistence can't be exercised. Serving the fixtures over `http://127.0.0.1`
 * gives every fixture a stable, real origin (the per-site storage key), which is
 * exactly what the persistence/auto-reapply spec needs.
 */
import { createServer, type Server } from "node:http";
import type { Socket } from "node:net";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

export interface StaticServer {
  /** Origin, e.g. `http://127.0.0.1:54321` (no trailing slash). */
  readonly origin: string;
  /** Builds an absolute URL for a fixture path, e.g. `/tag-styled.html`. */
  url(path: string): string;
  close(): Promise<void>;
}

/**
 * Starts a static server rooted at `rootDir` on an ephemeral port (127.0.0.1).
 * Only serves files inside `rootDir` (path traversal is rejected).
 */
export const startStaticServer = async (
  rootDir: string,
): Promise<StaticServer> => {
  const server: Server = createServer((req, res) => {
    const rawPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
    // Resolve against root and reject anything that escapes it.
    const resolved = normalize(join(rootDir, rawPath));
    if (!resolved.startsWith(rootDir)) {
      res.statusCode = 403;
      res.end("forbidden");
      return;
    }
    readFile(resolved)
      .then((buf) => {
        res.statusCode = 200;
        res.setHeader(
          "Content-Type",
          CONTENT_TYPES[extname(resolved).toLowerCase()] ??
            "application/octet-stream",
        );
        res.end(buf);
      })
      .catch(() => {
        res.statusCode = 404;
        res.end("not found");
      });
  });

  // Track open sockets so `close()` can force-destroy keep-alive connections —
  // the browser keeps fixture sockets alive, and plain `server.close()` would
  // otherwise block teardown until they idle out.
  const sockets = new Set<Socket>();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("static server failed to bind a TCP port");
  }
  const origin = `http://127.0.0.1:${address.port}`;

  return {
    origin,
    url: (path: string) =>
      `${origin}${path.startsWith("/") ? path : `/${path}`}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        for (const socket of sockets) {
          socket.destroy();
        }
        sockets.clear();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
};
