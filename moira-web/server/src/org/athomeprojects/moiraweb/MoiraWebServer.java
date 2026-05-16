package org.athomeprojects.moiraweb;

import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Map;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.zip.GZIPOutputStream;

public final class MoiraWebServer {
    private static final int GZIP_MIN_BYTES = 512;

    private final AppConfig config;
    private final MoiraBridge bridge;
    private final StaticAssets staticAssets;
    private HttpServer server;
    private ExecutorService executor;

    private MoiraWebServer(AppConfig config) {
        this.config = config;
        this.bridge = new MoiraBridge(config.resourceDir);
        this.staticAssets = new StaticAssets(config.staticDir, config.staticCache);
    }

    public static void main(String[] args) throws Exception {
        AppConfig config = AppConfig.fromEnv(args);
        MoiraWebServer app = new MoiraWebServer(config);
        app.start();
    }

    private void start() throws IOException {
        if (!Files.isDirectory(config.staticDir)) {
            throw new IllegalStateException("Static directory does not exist: "
                    + config.staticDir);
        }
        if (!Files.exists(config.staticDir.resolve("index.html"))) {
            throw new IllegalStateException("Static index does not exist: "
                    + config.staticDir.resolve("index.html"));
        }

        server = HttpServer.create(new InetSocketAddress(config.host, config.port),
                config.maxThreads);
        server.createContext("/health", route(this::health));
        server.createContext("/ready", route(this::ready));
        server.createContext("/api/version", route(this::version));
        server.createContext("/api/runtime/options", route(this::runtimeOptions));
        server.createContext("/api/features", route(this::features));
        server.createContext("/api/chart/preview", route(this::chartPreview));
        server.createContext("/api/chart/compute", route(this::computeChart));
        server.createContext("/api/entries/pack", route(this::packEntry));
        server.createContext("/api/entries/unpack", route(this::unpackEntry));
        server.createContext("/api/datasets/export", route(this::exportDataSet));
        server.createContext("/api/datasets/import", route(this::importDataSet));
        server.createContext("/", route(this::staticFile));
        executor = Executors.newFixedThreadPool(config.maxThreads,
                new NamedThreadFactory());
        server.setExecutor(executor);
        Runtime.getRuntime().addShutdownHook(new Thread(this::stop,
                "moira-web-shutdown"));
        server.start();
        log("server_started", "host", config.host, "port", config.port,
                "staticDir", config.staticDir, "staticCache",
                config.staticCache, "resourceReady", bridge.ready(),
                "maxThreads", config.maxThreads);
    }

    private void stop() {
        if (server != null) {
            server.stop(3);
        }
        if (executor != null) {
            executor.shutdown();
            try {
                if (!executor.awaitTermination(5, TimeUnit.SECONDS)) {
                    executor.shutdownNow();
                }
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                executor.shutdownNow();
            }
        }
    }

    private HttpHandler route(ExchangeHandler handler) {
        return exchange -> {
            String requestId = UUID.randomUUID().toString();
            long started = System.currentTimeMillis();
            try {
                addBaseHeaders(exchange, requestId);
                if ("OPTIONS".equals(exchange.getRequestMethod())) {
                    exchange.sendResponseHeaders(204, -1);
                    return;
                }
                handler.handle(exchange);
            } catch (Exception ex) {
                error(exchange, requestId, ex);
            } finally {
                log("request", "requestId", requestId, "method",
                        exchange.getRequestMethod(), "path",
                        exchange.getRequestURI().getPath(), "status",
                        exchange.getResponseCode(), "durationMs",
                        System.currentTimeMillis() - started);
                exchange.close();
            }
        };
    }

    private void health(HttpExchange exchange) throws IOException {
        ensureMethod(exchange, "GET", "HEAD");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "ok");
        body.put("time", Instant.now().toString());
        json(exchange, 200, body);
    }

    private void ready(HttpExchange exchange) throws IOException {
        ensureMethod(exchange, "GET", "HEAD");
        Map<String, Object> body = new LinkedHashMap<>();
        boolean staticReady = Files.isDirectory(config.staticDir);
        boolean resourceReady = bridge.ready();
        body.put("status", staticReady && resourceReady ? "ready" : "not-ready");
        body.put("staticDir", config.staticDir.toString());
        body.put("resourceReady", resourceReady);
        body.put("staticCache", config.staticCache);
        json(exchange, 200, body);
    }

    private void version(HttpExchange exchange) throws IOException {
        ensureMethod(exchange, "GET", "HEAD");
        json(exchange, 200, bridge.version());
    }

    private void features(HttpExchange exchange) throws IOException {
        ensureMethod(exchange, "GET", "HEAD");
        json(exchange, 200, bridge.features());
    }

    private void runtimeOptions(HttpExchange exchange) throws IOException {
        ensureMethod(exchange, "GET", "HEAD");
        json(exchange, 200, bridge.runtimeOptions());
    }

    private void chartPreview(HttpExchange exchange) throws IOException {
        ensureMethod(exchange, "GET", "HEAD");
        json(exchange, 200, bridge.preview());
    }

    private void computeChart(HttpExchange exchange) throws IOException {
        ensureMethod(exchange, "POST");
        String body = new String(readBody(exchange), StandardCharsets.UTF_8);
        json(exchange, 200, bridge.computeChart(Json.parseStringObject(body)));
    }

    private void packEntry(HttpExchange exchange) throws IOException {
        ensureMethod(exchange, "POST");
        String body = new String(readBody(exchange), StandardCharsets.UTF_8);
        json(exchange, 200, bridge.packEntry(Json.parseStringObject(body)));
    }

    private void unpackEntry(HttpExchange exchange) throws IOException {
        ensureMethod(exchange, "POST");
        String body = new String(readBody(exchange), StandardCharsets.UTF_8);
        json(exchange, 200, bridge.unpackEntry(Json.parseStringObject(body)));
    }

    private void exportDataSet(HttpExchange exchange) throws IOException {
        ensureMethod(exchange, "POST");
        String body = new String(readBody(exchange), StandardCharsets.UTF_8);
        json(exchange, 200, bridge.exportDataSet(Json.parseStringObject(body)));
    }

    private void importDataSet(HttpExchange exchange) throws IOException {
        ensureMethod(exchange, "POST");
        String body = new String(readBody(exchange), StandardCharsets.UTF_8);
        json(exchange, 200, bridge.importDataSet(Json.parseStringObject(body)));
    }

    private void staticFile(HttpExchange exchange) throws IOException {
        ensureMethod(exchange, "GET", "HEAD");
        String requestPath = exchange.getRequestURI().getPath();
        if (requestPath.equals("/")) {
            requestPath = "/index.html";
        }
        String relative = requestPath.substring(1);
        StaticAsset asset = staticAssets.get(relative);
        if (asset == null && relative.indexOf('.') < 0) {
            asset = staticAssets.get("index.html");
        }
        if (asset == null) {
            json(exchange, 404, errorBody("not_found", "Static asset not found."));
            return;
        }

        Headers headers = exchange.getResponseHeaders();
        headers.set("Content-Type", asset.contentType);
        headers.set("Cache-Control", asset.cacheControl);
        headers.set("ETag", asset.etag);
        setVary(headers, "Accept-Encoding");
        String ifNoneMatch = exchange.getRequestHeaders().getFirst("If-None-Match");
        if (asset.etag.equals(ifNoneMatch)) {
            exchange.sendResponseHeaders(304, -1);
            return;
        }

        byte[] payload = asset.body;
        if (asset.gzipBody != null && acceptsGzip(exchange)) {
            payload = asset.gzipBody;
            headers.set("Content-Encoding", "gzip");
        }
        sendBytes(exchange, 200, payload);
    }

    private byte[] readBody(HttpExchange exchange) throws IOException {
        try (InputStream in = exchange.getRequestBody();
                ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int total = 0;
            int read;
            while ((read = in.read(buffer)) != -1) {
                total += read;
                if (total > config.maxBodyBytes) {
                    throw new IllegalArgumentException("Request body is too large.");
                }
                out.write(buffer, 0, read);
            }
            return out.toByteArray();
        }
    }

    private void ensureMethod(HttpExchange exchange, String... methods)
            throws IOException {
        for (String method : methods) {
            if (method.equals(exchange.getRequestMethod())) {
                return;
            }
        }
        exchange.getResponseHeaders().set("Allow", String.join(",", methods));
        json(exchange, 405, errorBody("method_not_allowed",
                "This endpoint accepts " + String.join(", ", methods) + " only."));
        throw new StopHandling();
    }

    private void addBaseHeaders(HttpExchange exchange, String requestId) {
        Headers headers = exchange.getResponseHeaders();
        headers.set("X-Request-ID", requestId);
        headers.set("X-Content-Type-Options", "nosniff");
        headers.set("Referrer-Policy", "no-referrer");
        headers.set("X-Frame-Options", "DENY");
        headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
        headers.set("Cache-Control", "no-store");
        if (!config.corsOrigin.isEmpty()) {
            headers.set("Access-Control-Allow-Origin", config.corsOrigin);
            headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
            headers.set("Access-Control-Allow-Headers", "Content-Type");
            headers.set("Access-Control-Expose-Headers", "X-Request-ID");
        }
    }

    private void json(HttpExchange exchange, int status, Map<String, ?> body)
            throws IOException {
        byte[] payload = Json.object(body).getBytes(StandardCharsets.UTF_8);
        Headers headers = exchange.getResponseHeaders();
        headers.set("Content-Type", "application/json; charset=utf-8");
        setVary(headers, "Accept-Encoding");
        if (payload.length >= GZIP_MIN_BYTES && acceptsGzip(exchange)) {
            payload = gzip(payload);
            headers.set("Content-Encoding", "gzip");
        }
        sendBytes(exchange, status, payload);
    }

    private void sendBytes(HttpExchange exchange, int status, byte[] payload)
            throws IOException {
        boolean head = "HEAD".equals(exchange.getRequestMethod());
        exchange.sendResponseHeaders(status, head ? -1 : payload.length);
        if (!head) {
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(payload);
            }
        }
    }

    private void error(HttpExchange exchange, String requestId, Exception ex)
            throws IOException {
        if (ex instanceof StopHandling) {
            return;
        }
        log("request_failed", "requestId", requestId, "error", ex.toString());
        if (exchange.getResponseCode() == -1) {
            if (ex instanceof IllegalArgumentException) {
                json(exchange, 400, errorBody("bad_request", ex.getMessage()));
            } else {
                json(exchange, 500, errorBody("internal_error",
                        "The server could not complete this request."));
            }
        }
    }

    private Map<String, Object> errorBody(String code, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", code);
        body.put("message", message);
        return body;
    }

    private boolean acceptsGzip(HttpExchange exchange) {
        String value = exchange.getRequestHeaders().getFirst("Accept-Encoding");
        return value != null
                && value.toLowerCase(Locale.ROOT).contains("gzip");
    }

    private static byte[] gzip(byte[] source) throws IOException {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        try (GZIPOutputStream gzip = new GZIPOutputStream(buffer)) {
            gzip.write(source);
        }
        return buffer.toByteArray();
    }

    private void setVary(Headers headers, String value) {
        String current = headers.getFirst("Vary");
        if (current == null || current.isEmpty()) {
            headers.set("Vary", value);
        } else if (!current.toLowerCase(Locale.ROOT)
                .contains(value.toLowerCase(Locale.ROOT))) {
            headers.set("Vary", current + ", " + value);
        }
    }

    private void log(String event, Object... fields) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("event", event);
        data.put("time", Instant.now().toString());
        for (int i = 0; i + 1 < fields.length; i += 2) {
            data.put(String.valueOf(fields[i]), fields[i + 1]);
        }
        System.out.println(Json.object(data));
        System.out.flush();
    }

    private interface ExchangeHandler {
        void handle(HttpExchange exchange) throws Exception;
    }

    private static final class StopHandling extends IOException {
    }

    private static final class NamedThreadFactory implements ThreadFactory {
        private int count;

        public Thread newThread(Runnable task) {
            Thread thread = new Thread(task, "moira-web-" + (++count));
            thread.setDaemon(false);
            return thread;
        }
    }

    private static final class StaticAssets {
        private final Path root;
        private final boolean cacheEnabled;
        private final Map<String, StaticAsset> cache = new ConcurrentHashMap<>();

        StaticAssets(Path root, boolean cacheEnabled) {
            this.root = root;
            this.cacheEnabled = cacheEnabled;
        }

        StaticAsset get(String relative) throws IOException {
            Path target = root.resolve(relative).normalize();
            if (!target.startsWith(root) || Files.isDirectory(target)
                    || !Files.exists(target)) {
                return null;
            }
            String key = root.relativize(target).toString();
            long modified = Files.getLastModifiedTime(target).toMillis();
            long size = Files.size(target);
            StaticAsset cached = cache.get(key);
            if (cacheEnabled && cached != null && cached.modified == modified
                    && cached.size == size) {
                return cached;
            }
            StaticAsset loaded = load(target, modified, size);
            if (cacheEnabled) {
                cache.put(key, loaded);
            }
            return loaded;
        }

        private StaticAsset load(Path path, long modified, long size)
                throws IOException {
            byte[] body = Files.readAllBytes(path);
            String contentType = contentType(path);
            byte[] gzipBody = null;
            if (body.length >= GZIP_MIN_BYTES && isCompressible(contentType)) {
                gzipBody = gzip(body);
            }
            String fileName = path.getFileName().toString();
            String cacheControl = "index.html".equals(fileName)
                    ? "no-cache"
                    : "public, max-age=600, stale-while-revalidate=86400";
            return new StaticAsset(body, gzipBody, contentType, etag(body),
                    cacheControl, modified, size);
        }

        private static String contentType(Path path) {
            String name = path.getFileName().toString();
            if (name.endsWith(".html")) {
                return "text/html; charset=utf-8";
            }
            if (name.endsWith(".css")) {
                return "text/css; charset=utf-8";
            }
            if (name.endsWith(".js")) {
                return "application/javascript; charset=utf-8";
            }
            if (name.endsWith(".json")) {
                return "application/json; charset=utf-8";
            }
            if (name.endsWith(".svg")) {
                return "image/svg+xml";
            }
            if (name.endsWith(".png")) {
                return "image/png";
            }
            if (name.endsWith(".jpg") || name.endsWith(".jpeg")) {
                return "image/jpeg";
            }
            if (name.endsWith(".ico")) {
                return "image/x-icon";
            }
            return "application/octet-stream";
        }

        private static boolean isCompressible(String contentType) {
            return contentType.startsWith("text/")
                    || contentType.startsWith("application/javascript")
                    || contentType.startsWith("application/json")
                    || contentType.startsWith("image/svg+xml");
        }

        private static String etag(byte[] body) {
            try {
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                byte[] hash = digest.digest(body);
                StringBuilder out = new StringBuilder("\"");
                for (byte value : hash) {
                    out.append(String.format("%02x", value));
                }
                out.append('"');
                return out.toString();
            } catch (NoSuchAlgorithmException ex) {
                return "\"" + body.length + "\"";
            }
        }
    }

    private static final class StaticAsset {
        final byte[] body;
        final byte[] gzipBody;
        final String contentType;
        final String etag;
        final String cacheControl;
        final long modified;
        final long size;

        StaticAsset(byte[] body, byte[] gzipBody, String contentType,
                String etag, String cacheControl, long modified, long size) {
            this.body = body;
            this.gzipBody = gzipBody;
            this.contentType = contentType;
            this.etag = etag;
            this.cacheControl = cacheControl;
            this.modified = modified;
            this.size = size;
        }
    }
}
