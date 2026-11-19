# Build the jar, then run it on a small Java image as a non-root user.
FROM eclipse-temurin:25-jdk AS build
WORKDIR /app
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN ./mvnw -B -q dependency:go-offline
COPY src src
RUN ./mvnw -B -q package -DskipTests

FROM eclipse-temurin:25-jre
RUN useradd --system --no-create-home eregion
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
USER eregion
ENV EREGION_ENV=production
# The heap follows the container's memory limit instead of a quarter of the host's, and an out-of-memory error
# ends the process so the orchestrator restarts it rather than leaving it half alive.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70 -XX:+ExitOnOutOfMemoryError"
EXPOSE 8080
# Tomcat's status line has no reason phrase ("HTTP/1.1 200 "), so the check matches the code alone.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["bash", "-c", "exec 3<>/dev/tcp/127.0.0.1/8080 && printf 'GET /api/health HTTP/1.0\\r\\n\\r\\n' >&3 && grep -qE '^HTTP/1\\.[01] 200' <&3"]
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
