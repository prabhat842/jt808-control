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
 * Stop order (safe shutdown):
 *   1. vehicle     — terminals send JT808 logout (0x0003)
 *   2. (2 s pause) — lets logout reach the server before it closes
 *   3. infrastructure — jt808-server @PreDestroy flushes ClickHouse write queue
 *   4. (2 s pause) — lets final ClickHouse writes land before DB shuts down
 *   5. database    — ClickHouse flushes MergeTree buffers, syncs WAL, exits cleanly
 *
 * Start order (concurrent within group, groups ordered):
 *   database → infrastructure → vehicle
 */
@Service
public class ProcessOrchestrator {
    private static final Logger log = LoggerFactory.getLogger(ProcessOrchestrator.class);

    private final Map<String, ManagedProcess> processes;
    private final List<ManagedProcess>        displayOrder;

    public ProcessOrchestrator(List<ServiceDefinition> definitions) {
        processes    = definitions.stream()
                .collect(Collectors.toMap(ServiceDefinition::getId, ManagedProcess::new));
        displayOrder = definitions.stream()
                .sorted(Comparator.comparingInt(ServiceDefinition::getDisplayOrder))
                .map(d -> processes.get(d.getId()))
                .toList();
    }

    public void start(String id) throws Exception { require(id).start(); }
    public void stop(String id)                   { require(id).stop(); }

    /**
     * Start all services in group order: database first (so data is available
     * when the server starts), then infrastructure, then vehicle.
     */
    public void startAll() {
        startGroup("database");
        startGroup("infrastructure");
        startGroup("vehicle");
    }

    /**
     * Stop in reverse order: vehicle → infrastructure → database.
     * Pauses between stages so each layer can flush cleanly before the next stops.
     */
    public void stopAll() {
        // 1. Vehicle terminals — send JT808 logout, close camera/DMS
        joinAll(stopGroup("vehicle"));

        // 2. Let the logout message reach the server
        sleepSafe(2000);

        // 3. Infrastructure — jt808-server @PreDestroy flushes ClickHouse write queue
        joinAll(stopGroup("infrastructure"));

        // 4. Let the final batch writes land in ClickHouse
        sleepSafe(2000);

        // 5. Database — ClickHouse flushes MergeTree buffers, syncs WAL
        joinAll(stopGroup("database"));
    }

    public void restartAll() {
        stopAll();
        sleepSafe(1000);
        startAll();
    }

    public List<StatusDto> status() {
        return displayOrder.stream().map(mp -> new StatusDto(
                mp.definition().getId(),
                mp.definition().getName(),
                mp.definition().getDescription(),
                mp.definition().getGroup(),
                mp.definition().getDisplayOrder(),
                mp.getState() == ManagedProcess.State.RUNNING,
                mp.getPid(),
                mp.getStartedAt() != null ? mp.getStartedAt().toString() : null,
                mp.getExitCode()
        )).toList();
    }

    public SseEmitter streamLogs(String id) { return require(id).subscribe(); }

    @PreDestroy
    public void shutdown() {
        log.info("Control panel shutting down — stopping all managed services");
        stopAll();
    }

    // ── helpers ───────────────────────────────────────────────────────────

    private void startGroup(String group) {
        joinAll(byGroup(group).stream()
                .map(mp -> Thread.ofVirtual().name("start-" + mp.definition().getId()).start(() -> {
                    try { mp.start(); }
                    catch (Exception e) { log.error("Failed to start {}: {}",
                            mp.definition().getName(), e.getMessage()); }
                }))
                .toList());
    }

    private List<Thread> stopGroup(String group) {
        return byGroup(group).stream()
                .map(mp -> Thread.ofVirtual().name("stop-" + mp.definition().getId()).start(mp::stop))
                .toList();
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
        for (Thread t : threads) {
            try { t.join(); }
            catch (InterruptedException e) { Thread.currentThread().interrupt(); return; }
        }
    }

    private static void sleepSafe(long millis) {
        try { Thread.sleep(millis); }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }

    public record StatusDto(
            String  id,
            String  name,
            String  description,
            String  group,
            int     displayOrder,
            boolean running,
            long    pid,
            String  startedAt,
            Integer exitCode) {}

    @Configuration
    static class ServiceConfig {
        @Bean
        @ConfigurationProperties(prefix = "services")
        public List<ServiceDefinition> serviceDefinitions() {
            return new java.util.ArrayList<>();
        }
    }
}
