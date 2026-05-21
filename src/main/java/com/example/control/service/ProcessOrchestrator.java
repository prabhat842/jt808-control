package com.example.control.service;

import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class ProcessOrchestrator {
    private static final Logger log = LoggerFactory.getLogger(ProcessOrchestrator.class);

    private final Map<String, ManagedProcess> processes;
    private final List<ManagedProcess> ordered; // sorted by startOrder

    public ProcessOrchestrator(List<ServiceDefinition> definitions) {
        processes = definitions.stream()
                .collect(Collectors.toMap(ServiceDefinition::getId, ManagedProcess::new));
        ordered = definitions.stream()
                .sorted(Comparator.comparingInt(ServiceDefinition::getStartOrder))
                .map(d -> processes.get(d.getId()))
                .toList();
    }

    public void start(String id) throws Exception {
        ManagedProcess mp = require(id);
        mp.start();
    }

    public void stop(String id) {
        require(id).stop();
    }

    public void startAll() {
        for (ManagedProcess mp : ordered) {
            try {
                mp.start();
                Thread.sleep(1500); // stagger startup
            } catch (Exception e) {
                log.error("Failed to start {}: {}", mp.definition().getName(), e.getMessage());
            }
        }
    }

    public void stopAll() {
        // stop in reverse start order
        for (int i = ordered.size() - 1; i >= 0; i--) {
            ordered.get(i).stop();
        }
    }

    public void restartAll() {
        stopAll();
        startAll();
    }

    public List<StatusDto> status() {
        return ordered.stream().map(mp -> new StatusDto(
                mp.definition().getId(),
                mp.definition().getName(),
                mp.definition().getDescription(),
                mp.getState().name(),
                mp.getPid(),
                mp.getStartedAt() != null ? mp.getStartedAt().toString() : null
        )).toList();
    }

    public SseEmitter streamLogs(String id) {
        return require(id).subscribe();
    }

    @PreDestroy
    public void shutdown() {
        log.info("Control panel shutting down — stopping all services");
        stopAll();
    }

    private ManagedProcess require(String id) {
        ManagedProcess mp = processes.get(id);
        if (mp == null) throw new IllegalArgumentException("Unknown service: " + id);
        return mp;
    }

    public record StatusDto(
            String id, String name, String description,
            String state, long pid, String startedAt) {}

    @Configuration
    static class ServiceConfig {
        @Bean
        @ConfigurationProperties(prefix = "services")
        public List<ServiceDefinition> serviceDefinitions() {
            return new java.util.ArrayList<>();
        }
    }
}
