package com.example.control.api;

import com.example.control.service.ProcessOrchestrator;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

@RestController
@RequestMapping("/api")
public class ControlApi {

    private final ProcessOrchestrator orchestrator;
    private final UiProperties        uiProperties;

    @Value("${rtvs-url:http://127.0.0.1:8089}")
    private String rtvsUrl;

    @Value("${server-url:http://127.0.0.1:8888}")
    private String serverUrl;

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3)).build();

    public ControlApi(ProcessOrchestrator orchestrator, UiProperties uiProperties) {
        this.orchestrator  = orchestrator;
        this.uiProperties  = uiProperties;
    }

    /**
     * Runtime configuration forwarded to the React UI.
     * The UI fetches this once on startup so no addresses are hardcoded in the bundle.
     */
    @GetMapping(value = "/config", produces = MediaType.APPLICATION_JSON_VALUE)
    public String config() {
        return "{"
            + "\"rtvsUrl\":\""     + uiProperties.getRtvsBrowserUrl() + "\","
            + "\"mapboxToken\":\"" + uiProperties.getMapboxToken()    + "\","
            + "\"mapCenterLat\":"  + uiProperties.getMapCenterLat()   + ","
            + "\"mapCenterLon\":"  + uiProperties.getMapCenterLon()   + ","
            + "\"mapZoom\":"       + uiProperties.getMapZoom()
            + "}";
    }

    @GetMapping("/status")
    public List<ProcessOrchestrator.StatusDto> status() {
        return orchestrator.status();
    }

    @PostMapping("/start/{id}")
    public ResponseEntity<Map<String, String>> start(@PathVariable String id) {
        try {
            orchestrator.start(id);
            return ResponseEntity.ok(Map.of("result", "started"));
        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            return ResponseEntity.internalServerError().body(Map.of("error", msg));
        }
    }

    @PostMapping("/stop/{id}")
    public Map<String, String> stop(@PathVariable String id) {
        orchestrator.stop(id);
        return Map.of("result", "stopped");
    }

    @PostMapping("/start-all")
    public Map<String, String> startAll() {
        new Thread(orchestrator::startAll, "start-all").start();
        return Map.of("result", "starting");
    }

    @PostMapping("/stop-all")
    public Map<String, String> stopAll() {
        new Thread(orchestrator::stopAll, "stop-all").start();
        return Map.of("result", "stopping");
    }

    @PostMapping("/restart-all")
    public Map<String, String> restartAll() {
        new Thread(orchestrator::restartAll, "restart-all").start();
        return Map.of("result", "restarting");
    }

    @GetMapping(value = "/logs/{id}", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter logs(@PathVariable String id) {
        return orchestrator.streamLogs(id);
    }

    // ── Server proxy (jt808-server: terminals, alarms, GPS, clips) ──────────

    @GetMapping(value = "/terminals", produces = MediaType.APPLICATION_JSON_VALUE)
    public CompletableFuture<ResponseEntity<String>> terminals() {
        return proxyAsync(serverUrl + "/api/terminals");
    }

    @GetMapping(value = "/sessions", produces = MediaType.APPLICATION_JSON_VALUE)
    public CompletableFuture<ResponseEntity<String>> sessions() {
        return proxyAsync(rtvsUrl + "/api/sessions");
    }

    @GetMapping(value = "/gps/latest", produces = MediaType.APPLICATION_JSON_VALUE)
    public CompletableFuture<ResponseEntity<String>> gpsLatest() {
        return proxyAsync(serverUrl + "/api/gps/latest");
    }

    @GetMapping(value = "/gps/recent", produces = MediaType.APPLICATION_JSON_VALUE)
    public CompletableFuture<ResponseEntity<String>> gpsRecent(
            @RequestParam(defaultValue = "200") int limit) {
        int safe = Math.max(1, Math.min(limit, 1000));
        return proxyAsync(serverUrl + "/api/gps/recent?limit=" + safe);
    }

    @GetMapping(value = "/alarms", produces = MediaType.APPLICATION_JSON_VALUE)
    public CompletableFuture<ResponseEntity<String>> alarms(
            @RequestParam(defaultValue = "200") int limit) {
        // limit is typed int — no injection possible
        int safe = Math.max(1, Math.min(limit, 1000));
        return proxyAsync(serverUrl + "/api/alarms?limit=" + safe);
    }

    @GetMapping(value = "/alarm-files", produces = MediaType.APPLICATION_JSON_VALUE)
    public CompletableFuture<ResponseEntity<String>> alarmFiles(
            @RequestParam String alarmId) {
        // URL-encode alarmId before forwarding
        String encoded = java.net.URLEncoder.encode(alarmId, java.nio.charset.StandardCharsets.UTF_8);
        return proxyAsync(serverUrl + "/api/alarm-files?alarmId=" + encoded);
    }

    @GetMapping(value = "/alarm-files/recent", produces = MediaType.APPLICATION_JSON_VALUE)
    public CompletableFuture<ResponseEntity<String>> recentAlarmFiles(
            @RequestParam(defaultValue = "100") int limit) {
        int safe = Math.max(1, Math.min(limit, 1000));
        return proxyAsync(serverUrl + "/api/alarm-files/recent?limit=" + safe);
    }

    // ── RTVS proxy (live stream start/stop) ──────────────────────────────

    @GetMapping(value = "/live/start", produces = MediaType.APPLICATION_JSON_VALUE)
    public CompletableFuture<ResponseEntity<String>> liveStart(
            @RequestParam String terminal,
            @RequestParam(defaultValue = "1") int channel,
            @RequestParam(defaultValue = "0") int type,
            @RequestParam(defaultValue = "false") boolean restart) {
        String encoded = java.net.URLEncoder.encode(terminal, java.nio.charset.StandardCharsets.UTF_8);
        return proxyAsync(rtvsUrl + "/api/live/start?terminal=" + encoded
                + "&channel=" + channel + "&type=" + type + "&restart=" + restart);
    }

    @GetMapping(value = "/live/stop", produces = MediaType.APPLICATION_JSON_VALUE)
    public CompletableFuture<ResponseEntity<String>> liveStop(
            @RequestParam String terminal,
            @RequestParam(defaultValue = "1") int channel) {
        String encoded = java.net.URLEncoder.encode(terminal, java.nio.charset.StandardCharsets.UTF_8);
        return proxyAsync(rtvsUrl + "/api/live/stop?terminal=" + encoded + "&channel=" + channel);
    }

    @GetMapping(value = "/clips", produces = MediaType.APPLICATION_JSON_VALUE)
    public CompletableFuture<ResponseEntity<String>> clips() {
        return proxyAsync(serverUrl + "/api/clips");
    }

    @GetMapping(value = "/media/clips/{terminalId}/{fileName:.+}")
    public CompletableFuture<ResponseEntity<byte[]>> clipMedia(
            @PathVariable String terminalId,
            @PathVariable String fileName) {
        String encodedTerminal = java.net.URLEncoder.encode(terminalId, java.nio.charset.StandardCharsets.UTF_8);
        String encodedFile = java.net.URLEncoder.encode(fileName, java.nio.charset.StandardCharsets.UTF_8);
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(serverUrl + "/media/clips/" + encodedTerminal + "/" + encodedFile))
                .timeout(Duration.ofSeconds(10))
                .GET()
                .build();
        return http.sendAsync(req, HttpResponse.BodyHandlers.ofByteArray())
                .thenApply(resp -> {
                    String contentType = resp.headers().firstValue("content-type")
                            .orElse(MediaType.APPLICATION_OCTET_STREAM_VALUE);
                    String contentDisposition = resp.headers().firstValue("content-disposition")
                            .orElse("inline; filename=\"" + fileName + "\"");
                    return ResponseEntity.status(resp.statusCode())
                            .contentType(MediaType.parseMediaType(contentType))
                            .header("Content-Disposition", contentDisposition)
                            .body(resp.body());
                });
    }

    @GetMapping(value = "/media/view/{terminalId}/{fileName:.+}", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> clipMediaViewer(
            @PathVariable String terminalId,
            @PathVariable String fileName) {
        String href = "/api/media/clips/" + pathPart(terminalId) + "/" + pathPart(fileName);
        String escapedName = html(fileName);
        String lower = fileName.toLowerCase(java.util.Locale.ROOT);
        String media = lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png")
                ? "<img src=\"" + href + "\" alt=\"" + escapedName + "\">"
                : "<video src=\"" + href + "\" controls autoplay playsinline></video>";
        String html = "<!doctype html><html><head><meta charset=\"utf-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                + "<title>" + escapedName + "</title>"
                + "<style>html,body{margin:0;height:100%;background:#111;color:#eee;font-family:sans-serif}"
                + "main{height:100%;display:grid;grid-template-rows:auto 1fr}header{padding:10px 14px;background:#181818}"
                + "video,img{max-width:100%;max-height:100%;place-self:center}section{display:grid;min-height:0}</style>"
                + "</head><body><main><header>" + escapedName + "</header><section>"
                + media
                + "</section></main></body></html>";
        return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).body(html);
    }

    private static String pathPart(String value) {
        return java.net.URLEncoder.encode(value, java.nio.charset.StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static String html(String value) {
        return value.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
    }

    @GetMapping(value = "/clips/events", produces = "text/event-stream")
    public void clipEvents(jakarta.servlet.http.HttpServletResponse response) throws Exception {
        response.setContentType("text/event-stream");
        response.setCharacterEncoding("UTF-8");
        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("Connection", "keep-alive");
        response.setHeader("X-Accel-Buffering", "no");
        // Simple blocking proxy — SSE from jt808-server piped to the browser
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(serverUrl + "/api/clips/events"))
                .timeout(Duration.ofSeconds(30))
                .GET().build();
        try {
            http.send(req, HttpResponse.BodyHandlers.ofLines()).body().forEach(line -> {
                try {
                    response.getWriter().write(line + "\n");
                    response.getWriter().flush();
                } catch (Exception ignored) { }
            });
        } catch (Exception ignored) { }
    }

    /**
     * Non-blocking proxy to RTVS. Returns a CompletableFuture so Spring MVC releases
     * the Tomcat thread immediately; the response is written when the future completes.
     * RTVS being slow or unreachable never ties up worker threads.
     */
    private CompletableFuture<ResponseEntity<String>> proxyAsync(String url) {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(15)).GET().build();
        return http.sendAsync(request, HttpResponse.BodyHandlers.ofString())
                .thenApply(resp -> ResponseEntity.status(resp.statusCode())
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(resp.body()))
                .exceptionally(ex -> {
                    // Return 503 so React Query treats it as an error and data stays undefined,
                    // falling back to the [] default — prevents .map() crash on error objects.
                    Throwable cause = ex.getCause() != null ? ex.getCause() : ex;
                    String msg = cause.getMessage() != null
                            ? cause.getMessage() : cause.getClass().getSimpleName();
                    return ResponseEntity.status(503)
                            .contentType(MediaType.APPLICATION_JSON)
                            .body("{\"error\":\"" + msg.replace("\"", "'") + "\"}");
                });
    }
}
