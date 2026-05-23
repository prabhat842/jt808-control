package com.example.control.api;

import com.example.control.service.ProcessOrchestrator;
import jakarta.servlet.http.HttpServletRequest;
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

    @Value("${rtvs-url:http://localhost:8089}")
    private String rtvsUrl;

    @Value("${server-url:http://localhost:8888}")
    private String serverUrl;

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3)).build();

    public ControlApi(ProcessOrchestrator orchestrator) {
        this.orchestrator = orchestrator;
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
        return proxyAsync(serverUrl + "/api/media/sessions");
    }

    @GetMapping(value = "/gps/latest", produces = MediaType.APPLICATION_JSON_VALUE)
    public CompletableFuture<ResponseEntity<String>> gpsLatest() {
        return proxyAsync(serverUrl + "/api/gps/latest");
    }

    @GetMapping(value = "/alarms", produces = MediaType.APPLICATION_JSON_VALUE)
    public CompletableFuture<ResponseEntity<String>> alarms(HttpServletRequest req) {
        String qs = req.getQueryString();
        return proxyAsync(serverUrl + "/api/alarms" + (qs != null ? "?" + qs : ""));
    }

    @GetMapping(value = "/alarm-files", produces = MediaType.APPLICATION_JSON_VALUE)
    public CompletableFuture<ResponseEntity<String>> alarmFiles(HttpServletRequest req) {
        String qs = req.getQueryString();
        return proxyAsync(serverUrl + "/api/alarm-files" + (qs != null ? "?" + qs : ""));
    }

    // ── RTVS proxy (live stream start/stop) ──────────────────────────────

    @GetMapping(value = "/live/start", produces = MediaType.APPLICATION_JSON_VALUE)
    public CompletableFuture<ResponseEntity<String>> liveStart(HttpServletRequest req) {
        String qs = req.getQueryString();
        return proxyAsync(rtvsUrl + "/api/live/start" + (qs != null ? "?" + qs : ""));
    }

    @GetMapping(value = "/live/stop", produces = MediaType.APPLICATION_JSON_VALUE)
    public CompletableFuture<ResponseEntity<String>> liveStop(HttpServletRequest req) {
        String qs = req.getQueryString();
        return proxyAsync(rtvsUrl + "/api/live/stop" + (qs != null ? "?" + qs : ""));
    }

    @GetMapping(value = "/clips", produces = MediaType.APPLICATION_JSON_VALUE)
    public CompletableFuture<ResponseEntity<String>> clips() {
        return proxyAsync(serverUrl + "/api/clips");
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
                .timeout(Duration.ofSeconds(2)).GET().build();
        return http.sendAsync(request, HttpResponse.BodyHandlers.ofString())
                .thenApply(resp -> ResponseEntity.ok()
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(resp.body()))
                .exceptionally(ex -> {
                    Throwable cause = ex.getCause() != null ? ex.getCause() : ex;
                    String msg = cause.getMessage() != null
                            ? cause.getMessage() : cause.getClass().getSimpleName();
                    return ResponseEntity.ok()
                            .contentType(MediaType.APPLICATION_JSON)
                            .body("{\"error\":\"" + msg.replace("\"", "'") + "\"}");
                });
    }
}
