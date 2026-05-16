package org.athomeprojects.moiraweb;

import org.athomeprojects.base.BaseTab;
import org.athomeprojects.base.Resource;

final class HeadlessTextTab extends BaseTab {
    private final StringBuilder data = new StringBuilder();

    public void clear() {
        data.setLength(0);
    }

    public void append(String str) {
        if (str != null) {
            data.append(str);
        }
    }

    public void appendLine(String str) {
        append(str);
        appendLine();
    }

    public void appendLine() {
        data.append(EOL);
    }

    public void setName(String name, boolean sex, boolean replace) {
        StringBuilder line = new StringBuilder();
        if (name != null && !name.isEmpty()) {
            line.append(Resource.getString("name")).append(": ").append(name)
                    .append("  ");
        }
        line.append(Resource.getString("sex")).append(": ")
                .append(Resource.getString(sex ? "male" : "female"));
        if (replace) {
            clear();
        }
        appendLine(line.toString());
    }

    public void setName(String name, boolean replace) {
        if (replace) {
            clear();
        }
        if (name != null && !name.isEmpty()) {
            appendLine(Resource.getString("name") + ": " + name);
        }
    }

    public void replace(String src, String dst) {
        String replaced = data.toString().replaceAll(src, dst);
        data.setLength(0);
        data.append(replaced);
    }

    String getText() {
        return data.toString().replace("\r\n", "\n");
    }
}
