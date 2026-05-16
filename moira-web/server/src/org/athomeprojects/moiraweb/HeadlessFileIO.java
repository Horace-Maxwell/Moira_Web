package org.athomeprojects.moiraweb;

import org.athomeprojects.base.BaseIO;
import org.athomeprojects.base.Resource;

import java.net.MalformedURLException;
import java.net.URL;
import java.nio.file.Path;
import java.nio.file.Paths;

final class HeadlessFileIO extends BaseIO {
    private final Path root;

    HeadlessFileIO(Path root) {
        this.root = root.toAbsolutePath().normalize();
    }

    public String getFileName(String fileName) {
        return resolve(fileName).toString();
    }

    public URL getURL(String fileName) {
        Path path = resolve(fileName);
        try {
            return path.toUri().toURL();
        } catch (MalformedURLException ex) {
            return null;
        }
    }

    private Path resolve(String fileName) {
        String name = fileName;
        if (name != null && name.startsWith(Resource.LOCAL_PREFIX)) {
            name = name.substring(Resource.LOCAL_PREFIX.length());
        }
        Path path = Paths.get(name == null ? "" : name);
        if (!path.isAbsolute()) {
            path = root.resolve(path);
        }
        return path.normalize();
    }
}
