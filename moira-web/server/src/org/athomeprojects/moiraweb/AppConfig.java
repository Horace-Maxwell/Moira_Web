package org.athomeprojects.moiraweb;

import java.nio.file.Path;
import java.nio.file.Paths;

final class AppConfig {
    static final int DEFAULT_PORT = 8080;
    static final String DEFAULT_HOST = "0.0.0.0";
    static final int DEFAULT_MAX_THREADS = Math.max(4,
            Runtime.getRuntime().availableProcessors() * 2);
    static final int DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;

    final String host;
    final int port;
    final Path staticDir;
    final Path resourceDir;
    final String corsOrigin;
    final int maxThreads;
    final int maxBodyBytes;
    final boolean staticCache;

    private AppConfig(String host, int port, Path staticDir, Path resourceDir,
            String corsOrigin, int maxThreads, int maxBodyBytes,
            boolean staticCache) {
        this.host = host;
        this.port = port;
        this.staticDir = staticDir;
        this.resourceDir = resourceDir;
        this.corsOrigin = corsOrigin;
        this.maxThreads = maxThreads;
        this.maxBodyBytes = maxBodyBytes;
        this.staticCache = staticCache;
    }

    static AppConfig fromEnv(String[] args) {
        String host = env("MOIRA_WEB_HOST", DEFAULT_HOST);
        int port = parsePort(env("MOIRA_WEB_PORT",
                env("PORT", Integer.toString(DEFAULT_PORT))));
        Path staticDir = Paths.get(env("MOIRA_WEB_STATIC_DIR", "client"))
                .toAbsolutePath().normalize();
        Path resourceDir = Paths.get(env("MOIRA_WEB_RESOURCE_DIR", "."))
                .toAbsolutePath().normalize();
        String corsOrigin = env("MOIRA_WEB_CORS_ORIGIN", "").trim();
        int maxThreads = parsePositiveInt(env("MOIRA_WEB_MAX_THREADS",
                Integer.toString(DEFAULT_MAX_THREADS)), "MOIRA_WEB_MAX_THREADS");
        int maxBodyBytes = parsePositiveInt(env("MOIRA_WEB_MAX_BODY_BYTES",
                Integer.toString(DEFAULT_MAX_BODY_BYTES)),
                "MOIRA_WEB_MAX_BODY_BYTES");
        boolean staticCache = parseBoolean(env("MOIRA_WEB_STATIC_CACHE", "true"));
        for (String arg : args) {
            if (arg.startsWith("--port=")) {
                port = parsePort(arg.substring("--port=".length()));
            } else if (arg.startsWith("--host=")) {
                host = arg.substring("--host=".length()).trim();
            } else if (arg.startsWith("--static-dir=")) {
                staticDir = Paths.get(arg.substring("--static-dir=".length()))
                        .toAbsolutePath().normalize();
            } else if (arg.startsWith("--resource-dir=")) {
                resourceDir = Paths
                        .get(arg.substring("--resource-dir=".length()))
                        .toAbsolutePath().normalize();
            }
        }
        if (host.isEmpty()) {
            throw new IllegalArgumentException("Host cannot be empty.");
        }
        return new AppConfig(host, port, staticDir, resourceDir, corsOrigin,
                maxThreads, maxBodyBytes, staticCache);
    }

    private static String env(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.trim().isEmpty() ? fallback : value.trim();
    }

    private static int parsePort(String raw) {
        try {
            int value = Integer.parseInt(raw);
            if (value < 1 || value > 65535) {
                throw new IllegalArgumentException("Port is out of range: " + raw);
            }
            return value;
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("Port must be numeric: " + raw, ex);
        }
    }

    private static int parsePositiveInt(String raw, String name) {
        try {
            int value = Integer.parseInt(raw);
            if (value < 1) {
                throw new IllegalArgumentException(name + " must be positive: " + raw);
            }
            return value;
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException(name + " must be numeric: " + raw,
                    ex);
        }
    }

    private static boolean parseBoolean(String raw) {
        return "true".equalsIgnoreCase(raw) || "1".equals(raw)
                || "yes".equalsIgnoreCase(raw) || "on".equalsIgnoreCase(raw);
    }
}
