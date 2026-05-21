package com.example.control.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.time.Instant;
import java.util.ArrayList;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;

public final class ManagedProcess {
    private static final Logger log = LoggerFactory.getLogger(ManagedProcess.class);
    private static final int LOG_BUFFER = 500;
    private static final int SHUTDOWN_TIMEOUT_SEC = 10;

    public enum State { STOPPED, STARTING, RUNNING, STOPPING }

    private final ServiceDefinition def;
    private volatile Process process;
    private volatile State state = State.STOPPED;
    private volatile Instant startedAt;
    private volatile long pid = -1;
    private final Deque<String> logBuffer = new ArrayDeque<>(LOG_BUFFER);
    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    public ManagedProcess(ServiceDefinition def) {
        this.def = def;
    }

    public synchronized void start() throws Exception {
        reconcileState();
        if (state == State.RUNNING || state == State.STARTING || state == State.STOPPING) return;
        if (process != null && process.isAlive()) {
            state = State.RUNNING;
            return;
        }
        state = State.STARTING;

        // Kill any orphan process running the same JAR (manually-started or leftover from a crash).
        // Port-independent: works regardless of which port the service is configured to use.
        evictOrphan(def.getJar());

        List<String> cmd = new ArrayList<>();
        cmd.add("java");
        cmd.add("-jar");
        cmd.add(def.getJar());
        cmd.addAll(def.getArgs());

        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.directory(new File(def.getWorkDir()));
        pb.redirectErrorStream(true); // merge stderr into stdout

        process = pb.start();
        pid = process.pid();
        startedAt = Instant.now();
        state = State.RUNNING;

        Thread reader = new Thread(() -> {
            try (BufferedReader br = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                String line;
                while ((line = br.readLine()) != null) {
                    appendLog(line);
                }
            } catch (Exception ignored) {}
            if (state == State.RUNNING) {
                state = State.STOPPED;
                process = null;
                pid = -1;
                appendLog("--- process exited ---");
            }
        }, def.getId() + "-reader");
        reader.setDaemon(true);
        reader.start();

        log.info("Started {} (pid={})", def.getName(), pid);
    }

    public synchronized void stop() {
        if (state == State.STOPPED || state == State.STOPPING) return;
        state = State.STOPPING;
        Process p = process;
        if (p == null) {
            state = State.STOPPED;
            pid = -1;
            return;
        }

        appendLog("--- stopping (SIGTERM) ---");
        p.destroy();
        try {
            if (!p.waitFor(SHUTDOWN_TIMEOUT_SEC, TimeUnit.SECONDS)) {
                appendLog("--- graceful timeout, forcing kill ---");
                p.destroyForcibly();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            p.destroyForcibly();
        }
        process = null;
        state = State.STOPPED;
        pid = -1;
        appendLog("--- stopped ---");
        log.info("Stopped {}", def.getName());
    }

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(0L); // no timeout
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError(e -> emitters.remove(emitter));

        // send buffered lines
        List<String> snapshot;
        synchronized (logBuffer) {
            snapshot = new ArrayList<>(logBuffer);
        }
        try {
            for (String line : snapshot) {
                emitter.send(SseEmitter.event().data(line));
            }
        } catch (Exception ignored) {}
        return emitter;
    }

    private void appendLog(String line) {
        synchronized (logBuffer) {
            if (logBuffer.size() >= LOG_BUFFER) logBuffer.pollFirst();
            logBuffer.addLast(line);
        }
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().data(line));
            } catch (Exception e) {
                emitters.remove(emitter);
            }
        }
    }

    public ServiceDefinition definition()   { return def; }
    public State getState()                 { return state; }
    public long getPid()                    { return pid; }
    public Instant getStartedAt()           { return startedAt; }
    public boolean isRunning()              { return state == State.RUNNING; }

    /**
     * Kills any JVM process already running {@code jarPath}, then waits up to 3 s
     * for it to exit. Port-independent: works regardless of how the service is
     * configured, and handles instances started manually outside the control panel.
     */
    private void evictOrphan(String jarPath) {
        try {
            // pgrep -f matches against the full command line
            Process pgrep = new ProcessBuilder("pgrep", "-f", jarPath)
                    .redirectErrorStream(true).start();
            String pids = new String(pgrep.getInputStream().readAllBytes()).trim();
            pgrep.waitFor(3, TimeUnit.SECONDS);
            if (pids.isBlank()) return;

            long self = ProcessHandle.current().pid();
            for (String pidStr : pids.split("\\s+")) {
                pidStr = pidStr.trim();
                if (pidStr.isEmpty()) continue;
                long orphanPid = Long.parseLong(pidStr);
                if (orphanPid == self) continue;
                appendLog("--- evicting orphan pid=" + orphanPid + " running " + jarPath + " ---");
                ProcessHandle.of(orphanPid).ifPresent(ph -> {
                    ph.destroy();
                    try { Thread.sleep(800); } catch (InterruptedException ignored) {}
                    if (ph.isAlive()) {
                        appendLog("--- graceful timeout, force-killing pid=" + orphanPid + " ---");
                        ph.destroyForcibly();
                    }
                });
            }
            // Give the OS a moment to reclaim the port(s)
            Thread.sleep(500);
        } catch (Exception e) {
            log.warn("evictOrphan({}) failed: {}", jarPath,
                    e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
        }
    }

    private void reconcileState() {
        Process p = process;
        if (p == null) {
            if (state != State.STOPPED) {
                state = State.STOPPED;
                pid = -1;
            }
            return;
        }
        if (p.isAlive()) {
            if (state == State.STOPPED) {
                state = State.RUNNING;
            }
            return;
        }
        process = null;
        state = State.STOPPED;
        pid = -1;
    }
}
