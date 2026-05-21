package com.example.control.api;

import com.example.control.service.ProcessOrchestrator;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class ControlApi {

    private final ProcessOrchestrator orchestrator;

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
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
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
}
