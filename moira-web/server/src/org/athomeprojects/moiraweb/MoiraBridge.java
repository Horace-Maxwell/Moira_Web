package org.athomeprojects.moiraweb;

import org.athomeprojects.base.DataEntry;
import org.athomeprojects.base.DataSet;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

final class MoiraBridge {
    private final HeadlessMoiraEngine engine;

    MoiraBridge(Path resourceRoot) {
        this.engine = new HeadlessMoiraEngine(resourceRoot);
    }

    Map<String, ?> version() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("name", "Moira Web");
        data.put("migrationStage", "headless-core-api");
        data.put("desktopSource", "Java/SWT Moira");
        data.put("apiVersion", 1);
        data.put("compatibilityPolicy", "additive-web-migration");
        return data;
    }

    Map<String, ?> preview() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("status", "headless-core-ready");
        data.put("message", "The web server can compute Moira charts through the legacy ChartData engine and return selectable text plus PNG chart output.");
        data.put("nextEndpoint", "/api/chart/compute");
        return data;
    }

    Map<String, ?> features() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("parityGoal", "The web version must preserve every desktop surface before replacing the desktop app.");
        data.put("desktopModes", Arrays.asList(
                feature("eastern", "七政四余星盘", "charting", "implemented"),
                feature("pick", "天星择日", "date-selection", "implemented"),
                feature("western", "占星盘", "charting", "implemented"),
                feature("sidereal", "郑氏星案", "charting", "implemented")));
        data.put("mainTabs", Arrays.asList(
                feature("chart", "星盘", "visual-chart", "implemented"),
                feature("birth", "生年", "text-panel", "implemented"),
                feature("now", "流年", "text-panel", "implemented"),
                feature("data", "计算", "text-panel", "implemented"),
                feature("pole", "八字", "text-panel", "implemented"),
                feature("note", "批注", "text-panel", "implemented"),
                feature("table", "管理", "data-table", "implemented")));
        data.put("textPages", Arrays.asList(
                feature("calculation-text", "计算全文", "selectable-text", "implemented"),
                feature("eight-char-text", "八字全文", "selectable-text", "implemented"),
                feature("note-text", "批注全文", "editable-text", "implemented"),
                feature("data-management", "资料管理", "editable-table", "implemented")));
        data.put("implementedBridge", Arrays.asList(
                feature("entry-pack", "DataEntry 打包", "legacy-data-model",
                        "implemented"),
                feature("dataset-mri", "MRI 档案导入/导出", "legacy-file-format",
                        "implemented"),
                feature("headless-chart", "ChartData 计算/绘图", "legacy-core",
                        "implemented")));
        data.put("migrationGuards", Arrays.asList(
                "Desktop app remains untouched while web endpoints are added.",
                "Every migrated endpoint should be compared against a known desktop fixture.",
                "Browser text pages must keep copy/select-all behavior.",
                "DigitalOcean deployment must serve the same frontend and API paths from one service."));
        return data;
    }

    boolean ready() {
        return engine.ready();
    }

    Map<String, ?> computeChart(Map<String, String> request) {
        return engine.compute(request);
    }

    Map<String, ?> runtimeOptions() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("chartModes", Arrays.asList(
                option("traditional", "七政四余星盘"),
                option("pick", "天星择日"),
                option("western", "占星盘"),
                option("sidereal", "郑氏星案")));
        data.put("astroModes", Arrays.asList(
                option("natal", "本命"),
                option("transit", "行运"),
                option("comparison", "比较盘"),
                option("solar-return", "太阳返照"),
                option("lunar-return", "太阴返照"),
                option("secondary-progression", "次限")));
        data.put("countries", Arrays.asList(org.athomeprojects.base.City.getCountryList()));
        data.put("zones", Arrays.asList(org.athomeprojects.base.City.getAllZoneNames()));
        data.put("defaults", option("country", org.athomeprojects.base.City.getDefaultCountry(),
                "city", org.athomeprojects.base.City.getDefaultCity(),
                "zone", "Asia/Shanghai"));
        return data;
    }

    Map<String, ?> packEntry(Map<String, String> request) {
        int type = entryType(request);
        String[] place = placeFromRequest(request);
        DataEntry entry = new DataEntry();
        entry.setName(value(request, "name", ""));
        entry.setSex(!"female".equalsIgnoreCase(value(request, "sex", "male")));
        entry.setCountry(place[0]);
        entry.setCity(place[1]);
        entry.setZone(value(request, "zone", "Asia/Shanghai"));
        entry.setBirthDay(parseDateTime(value(request, "birthDate", "2006-04-10"),
                value(request, "birthTime", "09:58")));
        if (type == DataSet.PICK) {
            entry.setChoice(booleanValue(request, "daySet", true));
            entry.setMountainPos(value(request, "mountainPos", "0.0"));
        } else {
            entry.setNowDay(parseDateTime(value(request, "nowDate",
                    value(request, "birthDate", "2006-04-10")), value(request,
                    "nowTime", value(request, "birthTime", "09:58"))));
        }
        String note = request.get("note");
        if (note != null) {
            entry.setNote(note);
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("status", "packed");
        data.put("type", typeName(type));
        data.put("normalized", normalizeEntry(entry, type));
        data.put("packedEntry", entry.packEntry(type));
        return data;
    }

    Map<String, ?> unpackEntry(Map<String, String> request) {
        int type = entryType(request);
        String packed = value(request, "packedEntry", value(request, "data", ""));
        if (packed.isEmpty()) {
            throw new IllegalArgumentException("packedEntry is required.");
        }
        DataEntry entry = new DataEntry();
        if (!entry.unpackEntry(packed, type)) {
            throw new IllegalArgumentException("packedEntry is not a valid Moira DataEntry.");
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("status", "unpacked");
        data.put("type", typeName(type));
        data.put("normalized", normalizeEntry(entry, type));
        return data;
    }

    Map<String, ?> exportDataSet(Map<String, String> request) {
        DataSet dataSet = new DataSet();
        addPackedEntries(dataSet, DataSet.DATA, value(request, "dataEntries", ""));
        addPackedEntries(dataSet, DataSet.PICK, value(request, "pickEntries", ""));
        dataSet.setFooter(value(request, "footer", ""));
        Path temp = null;
        try {
            temp = Files.createTempFile("moira-web-export-", ".mri");
            DataSet.setMapString(null);
            dataSet.saveData(temp.toString());
            byte[] bytes = Files.readAllBytes(temp);
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("status", "exported");
            data.put("fileName", value(request, "fileName", "moira-web.mri"));
            data.put("contentType", "application/octet-stream");
            data.put("mriBase64", Base64.getEncoder().encodeToString(bytes));
            data.put("byteLength", bytes.length);
            data.put("dataCount", dataSet.getMaxDataEntry(DataSet.DATA));
            data.put("pickCount", dataSet.getMaxDataEntry(DataSet.PICK));
            return data;
        } catch (IOException ex) {
            throw new IllegalStateException("Could not export MRI data.", ex);
        } finally {
            deleteQuietly(temp);
        }
    }

    Map<String, ?> importDataSet(Map<String, String> request) {
        String encoded = value(request, "mriBase64", "");
        if (encoded.isEmpty()) {
            throw new IllegalArgumentException("mriBase64 is required.");
        }
        Path temp = null;
        try {
            temp = Files.createTempFile("moira-web-import-", ".mri");
            Files.write(temp, Base64.getDecoder().decode(encoded));
            DataSet dataSet = new DataSet();
            if (!dataSet.loadData(temp.toString())) {
                throw new IllegalArgumentException("MRI data does not contain usable entries.");
            }
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("status", "imported");
            data.put("footer", dataSet.getFooter());
            data.put("dataEntries", dataSetEntries(dataSet, DataSet.DATA));
            data.put("pickEntries", dataSetEntries(dataSet, DataSet.PICK));
            data.put("dataCount", dataSet.getMaxDataEntry(DataSet.DATA));
            data.put("pickCount", dataSet.getMaxDataEntry(DataSet.PICK));
            return data;
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (IOException ex) {
            throw new IllegalStateException("Could not import MRI data.", ex);
        } finally {
            deleteQuietly(temp);
        }
    }

    private String[] placeFromRequest(Map<String, String> request) {
        String country = value(request, "country", "中国");
        String city = value(request, "city", value(request, "location", "北京"));
        if (city.contains(",")) {
            String[] parts = city.split(",", 2);
            city = parts[0].trim();
            if (value(request, "country", "").isEmpty()) {
                country = parts[1].trim();
            }
        }
        return new String[] { country, city };
    }

    private void addPackedEntries(DataSet dataSet, int type, String packedList) {
        List<DataEntry> entries = new ArrayList<>();
        if (!packedList.trim().isEmpty()) {
            String[] items = packedList.split("\\|");
            for (String item : items) {
                if (item.trim().isEmpty()) {
                    continue;
                }
                String packed = new String(Base64.getDecoder().decode(item.trim()),
                        StandardCharsets.UTF_8);
                DataEntry entry = new DataEntry();
                if (!entry.unpackEntry(packed, type)) {
                    throw new IllegalArgumentException("Invalid packed entry in "
                            + typeName(type) + ".");
                }
                entries.add(entry);
            }
        }
        dataSet.setMaxDataEntry(entries.size(), type);
        for (int i = 0; i < entries.size(); i++) {
            dataSet.setDataEntry(i, entries.get(i), type);
        }
    }

    private List<Map<String, Object>> dataSetEntries(DataSet dataSet, int type) {
        List<Map<String, Object>> entries = new ArrayList<>();
        for (int i = 0; i < dataSet.getMaxDataEntry(type); i++) {
            if (!dataSet.hasDataEntry(i, type)) {
                continue;
            }
            DataEntry entry = dataSet.getDataEntry(i, type);
            Map<String, Object> normalized = normalizeEntry(entry, type);
            normalized.put("index", i);
            normalized.put("packedEntry", entry.packEntry(type));
            entries.add(normalized);
        }
        return entries;
    }

    private Map<String, Object> normalizeEntry(DataEntry entry, int type) {
        Map<String, Object> normalized = new LinkedHashMap<>();
        int[] birthDay = entry.getBirthDay();
        int[] nowDay = entry.getNowDay();
        normalized.put("entryType", type == DataSet.PICK ? "pick" : "data");
        normalized.put("mode", type == DataSet.PICK ? "pick" : "traditional");
        normalized.put("name", entry.getName());
        normalized.put("sex", entry.getSex() ? "male" : "female");
        normalized.put("country", entry.getCountry());
        normalized.put("city", entry.getCity());
        normalized.put("zone", entry.getZone());
        normalized.put("birthDay", birthDay);
        normalized.put("birthDate", formatDate(birthDay));
        normalized.put("birthTime", formatTime(birthDay));
        normalized.put("nowDay", nowDay);
        normalized.put("nowDate", formatDate(nowDay));
        normalized.put("nowTime", formatTime(nowDay));
        normalized.put("daySet", entry.getChoice());
        normalized.put("mountainPos", entry.getMountainPos());
        normalized.put("note", entry.getNote(true));
        return normalized;
    }

    private int entryType(Map<String, String> request) {
        String raw = value(request, "entryType", value(request, "mode", "data"));
        return "pick".equalsIgnoreCase(raw) || "election".equalsIgnoreCase(raw)
                ? DataSet.PICK
                : DataSet.DATA;
    }

    private String typeName(int type) {
        return type == DataSet.PICK ? "DataSet.PICK" : "DataSet.DATA";
    }

    private String value(Map<String, String> request, String key, String fallback) {
        String value = request.get(key);
        return value == null || value.trim().isEmpty() ? fallback : value.trim();
    }

    private boolean booleanValue(Map<String, String> request, String key,
            boolean fallback) {
        String raw = request.get(key);
        if (raw == null || raw.trim().isEmpty()) {
            return fallback;
        }
        return "true".equalsIgnoreCase(raw) || "1".equals(raw)
                || "yes".equalsIgnoreCase(raw) || "on".equalsIgnoreCase(raw);
    }

    private int[] parseDateTime(String date, String time) {
        String[] dateParts = date.split("-");
        String[] timeParts = time.split(":");
        if (dateParts.length != 3 || timeParts.length < 2) {
            throw new IllegalArgumentException("birthDate or birthTime is invalid.");
        }
        int year = parseInt(dateParts[0], "year");
        int month = parseInt(dateParts[1], "month");
        int day = parseInt(dateParts[2], "day");
        int hour = parseInt(timeParts[0], "hour");
        int minute = parseInt(timeParts[1], "minute");
        if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0
                || hour > 23 || minute < 0 || minute > 59) {
            throw new IllegalArgumentException("birthDate or birthTime is out of range.");
        }
        return new int[] { year, month, day, hour, minute };
    }

    private int parseInt(String value, String field) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("Invalid " + field + ": " + value, ex);
        }
    }

    private String formatDate(int[] date) {
        if (date == null || date.length < 3) {
            return "";
        }
        return String.format("%04d-%02d-%02d", date[0], date[1], date[2]);
    }

    private String formatTime(int[] date) {
        if (date == null || date.length < 5) {
            return "";
        }
        return String.format("%02d:%02d", date[3], date[4]);
    }

    private Map<String, String> option(String id, String title) {
        Map<String, String> item = new LinkedHashMap<>();
        item.put("id", id);
        item.put("title", title);
        return item;
    }

    private Map<String, String> option(String k1, String v1, String k2, String v2,
            String k3, String v3) {
        Map<String, String> item = new LinkedHashMap<>();
        item.put(k1, v1);
        item.put(k2, v2);
        item.put(k3, v3);
        return item;
    }

    private void deleteQuietly(Path path) {
        if (path != null) {
            try {
                Files.deleteIfExists(path);
            } catch (IOException ex) {
            }
        }
    }

    private Map<String, String> feature(String id, String title, String type,
            String status) {
        Map<String, String> item = new LinkedHashMap<>();
        item.put("id", id);
        item.put("title", title);
        item.put("type", type);
        item.put("status", status);
        return item;
    }
}
