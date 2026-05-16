FROM eclipse-temurin:11-jdk-jammy AS build

WORKDIR /workspace
COPY . .
RUN ./moira-web/scripts/build-server.sh

FROM eclipse-temurin:11-jre-jammy

WORKDIR /app
COPY --from=build /workspace/moira-web/build/moira-web.jar /app/moira-web.jar
COPY --from=build /workspace/moira-web/client /app/client
COPY --from=build /workspace/moira_s.prop /app/resources/moira_s.prop
COPY --from=build /workspace/moira_t.prop /app/resources/moira_t.prop
COPY --from=build /workspace/sample_s.prop /app/resources/sample_s.prop
COPY --from=build /workspace/sample_t.prop /app/resources/sample_t.prop
COPY --from=build /workspace/cities.prop /app/resources/cities.prop
COPY --from=build /workspace/WMM2005.COF /app/resources/WMM2005.COF
COPY --from=build /workspace/WMM2010.COF /app/resources/WMM2010.COF
COPY --from=build /workspace/ephe /app/resources/ephe
COPY --from=build /workspace/icon /app/resources/icon

ENV MOIRA_WEB_HOST=0.0.0.0
ENV MOIRA_WEB_STATIC_DIR=/app/client
ENV MOIRA_WEB_RESOURCE_DIR=/app/resources
ENV MOIRA_WEB_STATIC_CACHE=true
EXPOSE 8080

CMD ["sh", "-c", "java ${JAVA_OPTS:--Djava.awt.headless=true -XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError} -jar /app/moira-web.jar --host=${MOIRA_WEB_HOST:-0.0.0.0} --port=${PORT:-8080} --static-dir=${MOIRA_WEB_STATIC_DIR:-/app/client} --resource-dir=${MOIRA_WEB_RESOURCE_DIR:-/app/resources}"]
