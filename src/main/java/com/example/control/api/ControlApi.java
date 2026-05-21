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

    // ── Media proxy (async, non-blocking — RTVS unavailability never ties up Tomcat threads) ──

    @GetMapping(value = "/terminals", produces = MediaType.APPLICATION_JSON_VALUE)
    public CompletableFuture<ResponseEntity<String>> terminals() {
        return proxyAsync(rtvsUrl + "/api/terminals");
    }

    @GetMapping(value = "/sessions", produces = MediaType.APPLICATION_JSON_VALUE)
    public CompletableFuture<ResponseEntity<String>> sessions() {
        return proxyAsync(rtvsUrl + "/api/sessions");
    }

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
