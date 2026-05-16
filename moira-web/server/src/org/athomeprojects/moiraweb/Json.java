package org.athomeprojects.moiraweb;

import java.util.Map;

final class Json {
    private Json() {
    }

    static String object(Map<String, ?> values) {
        StringBuilder out = new StringBuilder();
        out.append('{');
        boolean first = true;
        for (Map.Entry<String, ?> entry : values.entrySet()) {
            if (!first) {
                out.append(',');
            }
            first = false;
            out.append(quote(entry.getKey())).append(':').append(value(entry.getValue()));
        }
        out.append('}');
        return out.toString();
    }

    static Map<String, String> parseStringObject(String json) {
        Parser parser = new Parser(json);
        return parser.parseObject();
    }

    static String quote(String value) {
        StringBuilder out = new StringBuilder();
        out.append('"');
        for (int i = 0; i < value.length(); i++) {
            char ch = value.charAt(i);
            switch (ch) {
                case '"':
                    out.append("\\\"");
                    break;
                case '\\':
                    out.append("\\\\");
                    break;
                case '\b':
                    out.append("\\b");
                    break;
                case '\f':
                    out.append("\\f");
                    break;
                case '\n':
                    out.append("\\n");
                    break;
                case '\r':
                    out.append("\\r");
                    break;
                case '\t':
                    out.append("\\t");
                    break;
                default:
                    if (ch < 0x20) {
                        out.append(String.format("\\u%04x", (int) ch));
                    } else {
                        out.append(ch);
                    }
                    break;
            }
        }
        out.append('"');
        return out.toString();
    }

    private static String value(Object value) {
        if (value == null) {
            return "null";
        }
        if (value instanceof Map) {
            return object((Map<String, ?>) value);
        }
        if (value instanceof java.nio.file.Path) {
            return quote(String.valueOf(value));
        }
        if (value instanceof Iterable) {
            return array((Iterable<?>) value);
        }
        if (value.getClass().isArray()) {
            return array(value);
        }
        if (value instanceof Number || value instanceof Boolean) {
            return String.valueOf(value);
        }
        return quote(String.valueOf(value));
    }

    private static String array(Iterable<?> values) {
        StringBuilder out = new StringBuilder();
        out.append('[');
        boolean first = true;
        for (Object item : values) {
            if (!first) {
                out.append(',');
            }
            first = false;
            out.append(value(item));
        }
        out.append(']');
        return out.toString();
    }

    private static String array(Object values) {
        StringBuilder out = new StringBuilder();
        out.append('[');
        int length = java.lang.reflect.Array.getLength(values);
        for (int i = 0; i < length; i++) {
            if (i > 0) {
                out.append(',');
            }
            out.append(value(java.lang.reflect.Array.get(values, i)));
        }
        out.append(']');
        return out.toString();
    }

    private static final class Parser {
        private final String source;
        private int index;

        Parser(String source) {
            this.source = source == null ? "" : source;
        }

        Map<String, String> parseObject() {
            java.util.LinkedHashMap<String, String> values = new java.util.LinkedHashMap<>();
            skipWhitespace();
            expect('{');
            skipWhitespace();
            if (peek('}')) {
                index++;
                return values;
            }
            while (true) {
                skipWhitespace();
                String key = parseString();
                skipWhitespace();
                expect(':');
                skipWhitespace();
                values.put(key, parseScalar());
                skipWhitespace();
                if (peek('}')) {
                    index++;
                    break;
                }
                expect(',');
            }
            skipWhitespace();
            if (index != source.length()) {
                throw new IllegalArgumentException("Unexpected trailing JSON content.");
            }
            return values;
        }

        private String parseScalar() {
            if (peek('"')) {
                return parseString();
            }
            int start = index;
            while (index < source.length()) {
                char ch = source.charAt(index);
                if (ch == ',' || ch == '}' || Character.isWhitespace(ch)) {
                    break;
                }
                index++;
            }
            String raw = source.substring(start, index);
            if ("null".equals(raw)) {
                return null;
            }
            if (raw.isEmpty()) {
                throw new IllegalArgumentException("Missing JSON value.");
            }
            return raw;
        }

        private String parseString() {
            expect('"');
            StringBuilder out = new StringBuilder();
            while (index < source.length()) {
                char ch = source.charAt(index++);
                if (ch == '"') {
                    return out.toString();
                }
                if (ch != '\\') {
                    out.append(ch);
                    continue;
                }
                if (index >= source.length()) {
                    throw new IllegalArgumentException("Unfinished JSON escape.");
                }
                char escaped = source.charAt(index++);
                switch (escaped) {
                    case '"':
                    case '\\':
                    case '/':
                        out.append(escaped);
                        break;
                    case 'b':
                        out.append('\b');
                        break;
                    case 'f':
                        out.append('\f');
                        break;
                    case 'n':
                        out.append('\n');
                        break;
                    case 'r':
                        out.append('\r');
                        break;
                    case 't':
                        out.append('\t');
                        break;
                    case 'u':
                        if (index + 4 > source.length()) {
                            throw new IllegalArgumentException("Invalid JSON unicode escape.");
                        }
                        String hex = source.substring(index, index + 4);
                        out.append((char) Integer.parseInt(hex, 16));
                        index += 4;
                        break;
                    default:
                        throw new IllegalArgumentException("Unsupported JSON escape: " + escaped);
                }
            }
            throw new IllegalArgumentException("Unclosed JSON string.");
        }

        private void expect(char expected) {
            if (index >= source.length() || source.charAt(index) != expected) {
                throw new IllegalArgumentException("Expected '" + expected + "'.");
            }
            index++;
        }

        private boolean peek(char expected) {
            return index < source.length() && source.charAt(index) == expected;
        }

        private void skipWhitespace() {
            while (index < source.length()
                    && Character.isWhitespace(source.charAt(index))) {
                index++;
            }
        }
    }
}
