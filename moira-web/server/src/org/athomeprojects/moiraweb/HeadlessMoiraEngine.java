package org.athomeprojects.moiraweb;

import org.athomeprojects.base.AppRuntime;
import org.athomeprojects.base.BaseMessage;
import org.athomeprojects.base.ChartData;
import org.athomeprojects.base.ChartMode;
import org.athomeprojects.base.City;
import org.athomeprojects.base.DataEntry;
import org.athomeprojects.base.DataSet;
import org.athomeprojects.base.DiagramTip;
import org.athomeprojects.base.DrawAWT;
import org.athomeprojects.base.FileIO;
import org.athomeprojects.base.Message;
import org.athomeprojects.base.Resource;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.Point;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

final class HeadlessMoiraEngine {
    private static final int DEFAULT_WIDTH = 1180;
    private static final int DEFAULT_HEIGHT = 760;
    private static final int MIN_IMAGE_SIZE = 360;
    private static final int MAX_IMAGE_SIZE = 5000;

    private final Path resourceRoot;

    HeadlessMoiraEngine(Path resourceRoot) {
        this.resourceRoot = resourceRoot.toAbsolutePath().normalize();
        initializeLegacyRuntime();
    }

    synchronized Map<String, ?> compute(Map<String, String> request) {
        int chartMode = parseChartMode(value(request, "mode", "traditional"));
        int astroMode = parseAstroMode(value(request, "astroMode", "natal"));
        ChartMode.setChartMode(chartMode);
        ChartMode.setAstroMode(astroMode);
        applyRuntimePreferences(request);
        ChartMode.setSingleWheelMode(booleanValue(request, "singleWheel", false));

        HeadlessTextTab dataTab = new HeadlessTextTab();
        HeadlessTextTab poleTab = new HeadlessTextTab();
        HeadlessTextTab evalTab = new HeadlessTextTab();
        ChartData chart = new ChartData(dataTab, poleTab, evalTab);
        chart.setEpheMode(booleanValue(request, "moshierEphemeris", false));
        chart.setShowNow(booleanValue(request, "showNow", true));
        chart.setShowAspects(booleanValue(request, "showAspects",
                chartMode == ChartMode.ASTRO_MODE));
        chart.setShowGauquelin(booleanValue(request, "showGauquelin", false));
        chart.setShowFixstar(booleanValue(request, "showFixstar", false));
        chart.setShowHoriz(booleanValue(request, "showHoriz", false));
        chart.setDaySet(booleanValue(request, "daySet", true));
        chart.setNoColor(booleanValue(request, "noColor", false));
        chart.setTimeAdjust(intValue(request, "timeAdjust",
                Resource.getPrefInt("longitude_adjust")));
        String mountainPos = value(request, "mountainPos", "");
        if (!mountainPos.isEmpty()) {
            chart.setMountainPos(mountainPos);
        }

        DataEntry entry = entryFromRequest(request);
        DiagramTip tip = new DiagramTip();
        String error = chart.compute(entry, entry, null, tip);
        if (error != null) {
            throw new IllegalArgumentException(error);
        }

        int width = boundedInt(request, "imageWidth", DEFAULT_WIDTH,
                MIN_IMAGE_SIZE, MAX_IMAGE_SIZE);
        int height = boundedInt(request, "imageHeight", DEFAULT_HEIGHT,
                MIN_IMAGE_SIZE, MAX_IMAGE_SIZE);
        int layoutWidth = boundedInt(request, "layoutWidth", width,
                MIN_IMAGE_SIZE, MAX_IMAGE_SIZE);
        int layoutHeight = boundedInt(request, "layoutHeight", height,
                MIN_IMAGE_SIZE, MAX_IMAGE_SIZE);
        int reservedWidth = boundedInt(request, "reservedWidth", 0,
                0, MAX_IMAGE_SIZE);
        int imageZoom = boundedInt(request, "imageZoom", 100, 100, 400);
        String chartBase64 = renderChart(chart, width, height, layoutWidth,
                layoutHeight, reservedWidth, imageZoom);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("status", "computed");
        data.put("mode", modeName(chartMode));
        data.put("astroMode", astroModeName(astroMode));
        data.put("normalized", normalized(entry, request));
        data.put("packedEntry", entry.packEntry(DataSet.DATA));
        data.put("chartPngBase64", chartBase64);
        data.put("chartImage", "data:image/png;base64," + chartBase64);
        data.put("textPages", textPages(dataTab, poleTab, evalTab));
        data.put("resourceRoot", resourceRoot.toString());
        return data;
    }

    boolean ready() {
        return Files.isDirectory(resourceRoot)
                && Files.isRegularFile(resourceRoot.resolve("moira_s.prop"))
                && Files.isRegularFile(resourceRoot.resolve("cities.prop"));
    }

    Path getResourceRoot() {
        return resourceRoot;
    }

    String fontName() {
        return Resource.getFontName();
    }

    private void initializeLegacyRuntime() {
        System.setProperty("java.awt.headless", "true");
        Resource.trace = false;
        FileIO.setBaseIO(new HeadlessFileIO(resourceRoot));
        AppRuntime.init(MoiraWebServer.class, resourceRoot.toString());
        Message.setMessage(new BaseMessage() {
        });
        new Resource(null, "simplified", preferredFontName(), null, null);
        ChartMode.initChartMode();
        City.loadCities("cities.prop");
    }

    private String preferredFontName() {
        String configured = System.getenv("MOIRA_WEB_FONT_NAME");
        if (configured == null || configured.trim().isEmpty()) {
            return null;
        }
        return configured;
    }

    private void applyRuntimePreferences(Map<String, String> request) {
        boolean showFixstar = booleanValue(request, "showFixstar", false);
        boolean showCompass = booleanValue(request, "showCompass", false);
        boolean verticalText = "vertical".equalsIgnoreCase(value(request,
                "fontDirection", "vertical"));
        Resource.putPrefInt("show_compass", showCompass ? 1 : 0);
        Resource.putPrefInt("enable_fixstar", showFixstar ? 1 : 0);
        Resource.putPrefInt("explain_star", booleanValue(request,
                "showAnnotations", false) ? 1 : 0);
        Resource.putPrefInt("display_vertical_text", verticalText ? 1 : 0);
        Resource.putPrefInt("image_vertical_text", verticalText ? 1 : 0);
        Resource.putPrefInt("show_house_system", booleanValue(request,
                "showHouseSystem", false) ? 1 : 0);
        Resource.putPrefInt("show_style", booleanValue(request,
                "showStyle", true) ? 1 : 0);
        Resource.putPrefInt("style_level", boundedInt(request, "styleLevel",
                Resource.getPrefInt("style_level"), 0, 9));
        Resource.putPrefInt("show_angle_marker", booleanValue(request,
                "showAngleMarker", false) ? 1 : 0);
        Resource.putPrefInt("life_mode", boundedInt(request, "lifeMode",
                Resource.getPrefInt("life_mode"), 0, 9));
        Resource.putPrefInt("self_mode", boundedInt(request, "selfMode",
                Resource.getPrefInt("self_mode"), 0, 9));
        Resource.putPrefInt("house_system_index", boundedInt(request,
                "houseSystemIndex", Resource.getPrefInt("house_system_index"),
                0, 10));
        Resource.putPrefInt("pick_house_system_index", boundedInt(request,
                "pickHouseSystemIndex",
                Resource.getPrefInt("pick_house_system_index"), 0, 10));
        boolean siderealMode = booleanValue(request, "astroSystemMode",
                "sidereal".equalsIgnoreCase(value(request, "zodiacMode", "")));
        Resource.putPrefInt("astro_system_mode", siderealMode ? 1 : 0);
        Resource.putPrefInt("astro_sidereal_index", boundedInt(request,
                "astroSiderealIndex",
                Resource.getPrefInt("astro_sidereal_index"), 0, 20));
        Resource.putPrefInt("degree_mode", "sidereal".equalsIgnoreCase(value(
                request, "zodiacMode", "")) ? ChartMode.ZODIAC_MODE
                        : ChartMode.MOUNTAIN_MODE);
        putIntArrayPreference("signDisplay", (ChartMode
                .isChartMode(ChartMode.ASTRO_MODE) ? "astro_" : "")
                + "sign_display", request);
        putIntArrayPreference("aspectDisplay", ChartMode.getModePrefix()
                + "aspects_display", request);
        putIntArrayPreference("angleMarkerDisplay", "angle_marker_display",
                request);
    }

    private void putIntArrayPreference(String requestKey, String prefKey,
            Map<String, String> request) {
        int[] array = intArrayValue(request.get(requestKey));
        if (array != null) {
            Resource.putPrefIntArray(prefKey, array);
        }
    }

    private int[] intArrayValue(String value) {
        if (value == null || value.trim().isEmpty()) {
            return null;
        }
        String[] parts = value.split(",");
        int[] array = new int[parts.length];
        for (int i = 0; i < parts.length; i++) {
            try {
                array[i] = Integer.parseInt(parts[i].trim());
            } catch (NumberFormatException ex) {
                return null;
            }
        }
        return array;
    }

    private DataEntry entryFromRequest(Map<String, String> request) {
        String[] place = placeFromRequest(request);
        DataEntry entry = new DataEntry();
        entry.setName(value(request, "name", ""));
        entry.setSex(!"female".equalsIgnoreCase(value(request, "sex", "male")));
        entry.setCountry(place[0]);
        entry.setCity(place[1]);
        entry.setZone(value(request, "zone", "Asia/Shanghai"));
        entry.setBirthDay(parseDateTime(value(request, "birthDate", "2006-04-10"),
                value(request, "birthTime", "09:58")));
        entry.setNowDay(parseDateTime(value(request, "nowDate",
                LocalDate.now().toString()), value(request, "nowTime",
                trimSeconds(LocalTime.now()))));
        String note = request.get("note");
        if (note != null) {
            entry.setNote(note);
        }
        return entry;
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

    private int[] parseDateTime(String date, String time) {
        String[] dateParts = date.split("-");
        String[] timeParts = time.split(":");
        if (dateParts.length != 3 || timeParts.length < 2) {
            throw new IllegalArgumentException("Date/time must be yyyy-MM-dd and HH:mm.");
        }
        int year = parseInt(dateParts[0], "year");
        int month = parseInt(dateParts[1], "month");
        int day = parseInt(dateParts[2], "day");
        int hour = parseInt(timeParts[0], "hour");
        int minute = parseInt(timeParts[1], "minute");
        if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0
                || hour > 23 || minute < 0 || minute > 59) {
            throw new IllegalArgumentException("Date/time is out of range.");
        }
        return new int[] { year, month, day, hour, minute };
    }

    private String renderChart(ChartData chart, int width, int height,
            int layoutWidth, int layoutHeight, int reservedWidth,
            int imageZoom) {
        BufferedImage image = new BufferedImage(width, height,
                BufferedImage.TYPE_INT_RGB);
        Graphics2D g2d = image.createGraphics();
        try {
            applyRenderHints(g2d);
            g2d.scale((double) width / layoutWidth,
                    (double) height / layoutHeight);
            int edgeSpacing = Resource.getInt("ui_diagram_edge_spacing");
            int drawWidth = Math.max(1,
                    layoutWidth - 2 * edgeSpacing - reservedWidth);
            int drawHeight = Math.max(1, layoutHeight - 2 * edgeSpacing - 1);
            DrawAWT.setFillColor(g2d, "chart_window_bg_color",
                    chart.getNoColor());
            g2d.fillRect(0, 0, layoutWidth, layoutHeight);
            g2d.translate(edgeSpacing + 5, Math.max(0, edgeSpacing - 2));
            int scaler = getScreenScaler(imageZoom);
            int baseWidth = Resource.DIAGRAM_WIDTH * scaler;
            double scale = (double) Math.min(drawWidth, drawHeight) / baseWidth;
            g2d.scale(scale, scale);
            int scaledWidth = (int) (drawWidth / scale);
            int scaledHeight = (int) (drawHeight / scale);
            boolean verticalText = Resource.getPrefInt("display_vertical_text") != 0;
            chart.pageDiagram(g2d, "", scaler, new Point(scaledWidth,
                            scaledHeight), new Point(baseWidth, baseWidth),
                    false, true, chart.getNoColor(), false, false, false,
                    verticalText, true);
        } finally {
            g2d.dispose();
        }
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(image, "png", out);
            return Base64.getEncoder().encodeToString(out.toByteArray());
        } catch (IOException ex) {
            throw new IllegalStateException("Could not render chart image.", ex);
        }
    }

    private void applyRenderHints(Graphics2D g2d) {
        g2d.setRenderingHint(RenderingHints.KEY_ALPHA_INTERPOLATION,
                RenderingHints.VALUE_ALPHA_INTERPOLATION_QUALITY);
        g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING,
                RenderingHints.VALUE_ANTIALIAS_ON);
        g2d.setRenderingHint(RenderingHints.KEY_COLOR_RENDERING,
                RenderingHints.VALUE_COLOR_RENDER_QUALITY);
        g2d.setRenderingHint(RenderingHints.KEY_FRACTIONALMETRICS,
                RenderingHints.VALUE_FRACTIONALMETRICS_ON);
        g2d.setRenderingHint(RenderingHints.KEY_INTERPOLATION,
                RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g2d.setRenderingHint(RenderingHints.KEY_RENDERING,
                RenderingHints.VALUE_RENDER_QUALITY);
        g2d.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL,
                RenderingHints.VALUE_STROKE_PURE);
        g2d.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING,
                RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
    }

    private int getScreenScaler(int zoom) {
        int scaler = Math.max(1, (zoom + 99) / 100);
        return Math.min(4, scaler);
    }

    private Map<String, Object> textPages(HeadlessTextTab dataTab,
            HeadlessTextTab poleTab, HeadlessTextTab evalTab) {
        Map<String, Object> pages = new LinkedHashMap<>();
        pages.put("calculation", dataTab.getText());
        pages.put("eightCharacters", poleTab.getText());
        pages.put("notes", evalTab.getText());
        return pages;
    }

    private Map<String, Object> normalized(DataEntry entry,
            Map<String, String> request) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("name", entry.getName());
        data.put("sex", entry.getSex() ? "male" : "female");
        data.put("country", entry.getCountry());
        data.put("city", entry.getCity());
        data.put("zone", entry.getZone());
        data.put("birthDate", value(request, "birthDate", "2006-04-10"));
        data.put("birthTime", value(request, "birthTime", "09:58"));
        data.put("nowDate", value(request, "nowDate", LocalDate.now().toString()));
        data.put("nowTime", value(request, "nowTime", trimSeconds(LocalTime.now())));
        return data;
    }

    private int parseChartMode(String raw) {
        String mode = raw.toLowerCase(Locale.ROOT);
        if ("sidereal".equals(mode) || "zheng".equals(mode)) {
            return ChartMode.SIDEREAL_MODE;
        }
        if ("pick".equals(mode) || "election".equals(mode)) {
            return ChartMode.PICK_MODE;
        }
        if ("western".equals(mode) || "astro".equals(mode)) {
            return ChartMode.ASTRO_MODE;
        }
        return ChartMode.TRADITIONAL_MODE;
    }

    private int parseAstroMode(String raw) {
        String mode = raw.toLowerCase(Locale.ROOT);
        if ("altNatal".equals(raw) || "alt-natal".equals(mode)) {
            return ChartMode.ALT_NATAL_MODE;
        }
        if ("solar-return".equals(mode) || "solarReturn".equals(raw)) {
            return ChartMode.SOLAR_RETURN_MODE;
        }
        if ("lunar-return".equals(mode) || "lunarReturn".equals(raw)) {
            return ChartMode.LUNAR_RETURN_MODE;
        }
        if ("relationship".equals(mode)) {
            return ChartMode.RELATIONSHIP_MODE;
        }
        if ("composite".equals(mode)) {
            return ChartMode.COMPOSITE_MODE;
        }
        if ("transit".equals(mode)) {
            return ChartMode.TRANSIT_MODE;
        }
        if ("primary-direction".equals(mode) || "primaryDirection".equals(raw)) {
            return ChartMode.PRIMARY_DIRECTION_MODE;
        }
        if ("secondary-progression".equals(mode)
                || "secondaryProgression".equals(raw)) {
            return ChartMode.SECONDARY_PROGRESSION_MODE;
        }
        if ("solar-arc".equals(mode) || "solarArc".equals(raw)) {
            return ChartMode.SOLAR_ARC_MODE;
        }
        if ("comparison".equals(mode)) {
            return ChartMode.COMPARISON_MODE;
        }
        return ChartMode.NATAL_MODE;
    }

    private String modeName(int mode) {
        switch (mode) {
        case ChartMode.SIDEREAL_MODE:
            return "sidereal";
        case ChartMode.PICK_MODE:
            return "pick";
        case ChartMode.ASTRO_MODE:
            return "western";
        default:
            return "traditional";
        }
    }

    private String astroModeName(int mode) {
        switch (mode) {
        case ChartMode.ALT_NATAL_MODE:
            return "alt-natal";
        case ChartMode.SOLAR_RETURN_MODE:
            return "solar-return";
        case ChartMode.LUNAR_RETURN_MODE:
            return "lunar-return";
        case ChartMode.RELATIONSHIP_MODE:
            return "relationship";
        case ChartMode.COMPOSITE_MODE:
            return "composite";
        case ChartMode.TRANSIT_MODE:
            return "transit";
        case ChartMode.PRIMARY_DIRECTION_MODE:
            return "primary-direction";
        case ChartMode.SECONDARY_PROGRESSION_MODE:
            return "secondary-progression";
        case ChartMode.SOLAR_ARC_MODE:
            return "solar-arc";
        case ChartMode.COMPARISON_MODE:
            return "comparison";
        default:
            return "natal";
        }
    }

    private String value(Map<String, String> request, String key, String fallback) {
        String val = request.get(key);
        return val == null || val.trim().isEmpty() ? fallback : val.trim();
    }

    private boolean booleanValue(Map<String, String> request, String key,
            boolean fallback) {
        String val = request.get(key);
        if (val == null || val.trim().isEmpty()) {
            return fallback;
        }
        return "true".equalsIgnoreCase(val) || "1".equals(val)
                || "yes".equalsIgnoreCase(val) || "on".equalsIgnoreCase(val);
    }

    private int intValue(Map<String, String> request, String key, int fallback) {
        String val = request.get(key);
        return val == null || val.trim().isEmpty() ? fallback
                : parseInt(val.trim(), key);
    }

    private int boundedInt(Map<String, String> request, String key, int fallback,
            int min, int max) {
        int value = intValue(request, key, fallback);
        if (value < min || value > max) {
            throw new IllegalArgumentException(key + " must be between " + min
                    + " and " + max + ".");
        }
        return value;
    }

    private int parseInt(String value, String field) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("Invalid " + field + ": " + value,
                    ex);
        }
    }

    private String trimSeconds(LocalTime time) {
        return String.format("%02d:%02d", time.getHour(), time.getMinute());
    }
}
