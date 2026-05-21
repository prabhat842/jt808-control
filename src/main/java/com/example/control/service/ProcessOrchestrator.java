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

/**
 * Manages the JT808 stack lifecycle.
 *
 * Architecture:
 *  - Vehicle services (simulator + DMS/ADAS/BSD) are INDEPENDENT.
 *    A driver starts the vehicle at any time; camera and sensors are always on.
 *    The terminal reconnects to the server automatically whenever it is available.
 *
 *  - Infrastructure services (server, rtvs) are also independent of each other
 *    and of the vehicle. They can be restarted without restarting the vehicle.
 *
 * startAll()  → starts all services concurrently with no imposed ordering.
 * stopAll()   → stops vehicle services first (clean logout), then infrastructure.
 */
@Service
public class ProcessOrchestrator {
    private static final Logger log = LoggerFactory.getLogger(ProcessOrchestrator.class);

    private final Map<String, ManagedProcess> processes;
    private final List<ManagedProcess> displayOrder;

    public ProcessOrchestrator(List<ServiceDefinition> definitions) {
        processes = definitions.stream()
                .collect(Collectors.toMap(ServiceDefinition::getId, ManagedProcess::new));
        displayOrder = definitions.stream()
                .sorted(Comparator.comparingInt(ServiceDefinition::getDisplayOrder))
                .map(d -> processes.get(d.getId()))
                .toList();
    }

    public void start(String id) throws Exception {
        require(id).start();
    }

    public void stop(String id) {
        require(id).stop();
    }

    /**
     * Start all services concurrently — no stagger, no ordering dependency.
     * Vehicle services connect to infrastructure when it becomes available.
     */
    public void startAll() {
        List<Thread> threads = displayOrder.stream()
                .map(mp -> Thread.ofVirtual().name("start-" + mp.definition().getId()).start(() -> {
                try {
                    mp.start();
                } catch (Exception e) {
                    log.error("Failed to start {}: {}", mp.definition().getName(), e.getMessage());
                }
            }))
                .toList();
        joinAll(threads);
    }

    /**
     * Stop in logical order: vehicle terminals first (sends JT808 logout),
     * then infrastructure (server, rtvs).
     */
    public void stopAll() {
        List<ManagedProcess> vehicle = byGroup("vehicle");
        List<ManagedProcess> infra   = byGroup("infrastructure");

        // Vehicle first — terminals log out gracefully per protocol
        joinAll(vehicle.stream()
                .map(mp -> Thread.ofVirtual().name("stop-" + mp.definition().getId()).start(mp::stop))
                .toList());

        // Brief pause so terminals can send 0x0003 logout before server closes
        try { Thread.sleep(2000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }

        // Infrastructure stops — server closes, rtvs closes
        joinAll(infra.stream()
                .map(mp -> Thread.ofVirtual().name("stop-" + mp.definition().getId()).start(mp::stop))
                .toList());
    }

    public void restartAll() {
        stopAll();
        try { Thread.sleep(1000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        startAll();
    }

    public List<StatusDto> status() {
        return displayOrder.stream().map(mp -> new StatusDto(
                mp.definition().getId(),
                mp.definition().getName(),
                mp.definition().getDescription(),
                mp.definition().getGroup(),
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
        log.info("Control panel shutting down — stopping all managed services");
        stopAll();
    }

    private ManagedProcess require(String id) {
        ManagedProcess mp = processes.get(id);
        if (mp == null) throw new IllegalArgumentException("Unknown service: " + id);
        return mp;
    }

    private List<ManagedProcess> byGroup(String group) {
        return displayOrder.stream()
                .filter(mp -> group.equals(mp.definition().getGroup()))
                .toList();
    }

    private static void joinAll(List<Thread> threads) {
        for (Thread thread : threads) {
            try {
                thread.join();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    public record StatusDto(
            String id, String name, String description, String group,
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
