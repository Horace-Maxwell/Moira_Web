#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/.." && pwd)"
BUILD_DIR="$ROOT_DIR/build"
CLASS_DIR="$BUILD_DIR/classes"
SOURCE_LIST="$BUILD_DIR/sources.txt"
MANIFEST_FILE="$BUILD_DIR/MANIFEST.MF"
SWT_JAR="$REPO_ROOT/lib/swt.jar"

JAVAC_BIN="${JAVA_HOME:+$JAVA_HOME/bin/}javac"
JAR_BIN="${JAVA_HOME:+$JAVA_HOME/bin/}jar"
if [[ ! -x "$JAVAC_BIN" ]]; then
  JAVAC_BIN="$(command -v javac)"
fi
if [[ ! -x "$JAR_BIN" ]]; then
  JAR_BIN="$(command -v jar)"
fi

rm -rf "$BUILD_DIR"
mkdir -p "$CLASS_DIR"
find "$ROOT_DIR/server/src" "$REPO_ROOT/src/org/athomeprojects/base" \
  "$REPO_ROOT/src/org/athomeprojects/swisseph" -name '*.java' | sort > "$SOURCE_LIST"
"$JAVAC_BIN" --release 11 -cp "$SWT_JAR" -d "$CLASS_DIR" @"$SOURCE_LIST"

{
  printf 'Manifest-Version: 1.0\n'
  printf 'Main-Class: org.athomeprojects.moiraweb.MoiraWebServer\n'
  printf '\n'
} > "$MANIFEST_FILE"

"$JAR_BIN" cfm "$BUILD_DIR/moira-web.jar" "$MANIFEST_FILE" -C "$CLASS_DIR" .
echo "Built $BUILD_DIR/moira-web.jar"
