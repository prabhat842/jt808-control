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

        // Kill any orphan process holding the same port (including manually-started instances)
        if (def.getPort() > 0) evictPort(def.getPort());

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
     * Kills any OS process currently bound to {@code port}, then waits up to
     * 3 seconds for the port to be released. Handles orphaned managed processes
     * and instances started manually outside the control panel.
     */
    private void evictPort(int port) {
        try {
            // lsof -ti:PORT prints the PID(s) of processes holding the port
            Process lsof = new ProcessBuilder("lsof", "-ti:" + port)
                    .redirectErrorStream(true).start();
            String pids = new String(lsof.getInputStream().readAllBytes()).trim();
            lsof.waitFor(3, TimeUnit.SECONDS);
            if (pids.isBlank()) return;

            appendLog("--- evicting orphan on port " + port + " (pid " + pids.replace('\n', ' ') + ") ---");
            for (String pidStr : pids.split("\\s+")) {
                long orphanPid = Long.parseLong(pidStr.trim());
                // Don't kill ourselves
                if (orphanPid == ProcessHandle.current().pid()) continue;
                ProcessHandle.of(orphanPid).ifPresent(ph -> {
                    ph.destroy();
                    try { Thread.sleep(500); } catch (InterruptedException ignored) {}
                    if (ph.isAlive()) ph.destroyForcibly();
                });
            }
            // Wait for port to be released (up to 3 s)
            for (int i = 0; i < 6; i++) {
                Thread.sleep(500);
                Process check = new ProcessBuilder("lsof", "-ti:" + port)
                        .redirectErrorStream(true).start();
                String still = new String(check.getInputStream().readAllBytes()).trim();
                check.waitFor(2, TimeUnit.SECONDS);
                if (still.isBlank()) break;
            }
        } catch (Exception e) {
            log.warn("evictPort({}) failed: {}", port, e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
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
