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

/**
 * Lifecycle wrapper for one managed process (Java JAR or native binary).
 *
 * Safe shutdown protocol:
 *   1. SIGTERM — asks the process to flush and exit gracefully.
 *      Java services: Spring @PreDestroy runs (flushes ClickHouse queues, etc.).
 *      ClickHouse: finishes in-flight queries, flushes MergeTree buffers, syncs WAL.
 *   2. Wait up to shutdownTimeoutSec (configurable per service — default 10 s,
 *      use 30 s for ClickHouse to give it time to flush data).
 *   3. SIGKILL only if the process ignores SIGTERM after the timeout.
 *
 * Orphan eviction: before starting, any stray process matching the same binary
 * or JAR path is killed so it doesn't hold the port.
 */
public final class ManagedProcess {
    private static final Logger log = LoggerFactory.getLogger(ManagedProcess.class);
    private static final int LOG_BUFFER = 500;

    public enum State { STOPPED, STARTING, RUNNING, STOPPING }

    private final ServiceDefinition def;
    private volatile Process  process;
    private volatile State    state     = State.STOPPED;
    private volatile Instant  startedAt;
    private volatile long     pid       = -1;
    private volatile Integer  exitCode  = null;

    private final Deque<String>       logBuffer = new ArrayDeque<>(LOG_BUFFER);
    private final List<SseEmitter>    emitters  = new CopyOnWriteArrayList<>();

    public ManagedProcess(ServiceDefinition def) { this.def = def; }

    // ── start ─────────────────────────────────────────────────────────────

    public synchronized void start() throws Exception {
        reconcileState();
        if (state == State.RUNNING || state == State.STARTING || state == State.STOPPING) return;
        if (process != null && process.isAlive()) { state = State.RUNNING; return; }

        state    = State.STARTING;
        exitCode = null;

        evictOrphan(def.processPattern());
        appendLog("--- starting " + def.getName() + " ---");

        List<String> cmd = buildCommand();
        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.directory(new File(def.getWorkDir()));
        pb.redirectErrorStream(true);

        process   = pb.start();
        pid       = process.pid();
        startedAt = Instant.now();
        state     = State.RUNNING;

        Thread reader = new Thread(() -> {
            try (BufferedReader br =
                         new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                String line;
                while ((line = br.readLine()) != null) appendLog(line);
            } catch (Exception ignored) {}

            exitCode = process.exitValue();
            if (state == State.RUNNING) {
                state   = State.STOPPED;
                process = null;
                pid     = -1;
                appendLog("--- process exited (code=" + exitCode + ") ---");
            }
        }, def.getId() + "-reader");
        reader.setDaemon(true);
        reader.start();

        log.info("Started {} pid={} cmd={}", def.getName(), pid, cmd.get(0));
    }

    // ── stop ──────────────────────────────────────────────────────────────

    /**
     * Sends SIGTERM and waits up to shutdownTimeoutSec for a clean exit.
     * Only escalates to SIGKILL if the process is still alive after the timeout.
     */
    public synchronized void stop() {
        if (state == State.STOPPED || state == State.STOPPING) return;
        state = State.STOPPING;
        Process p = process;
        if (p == null) { state = State.STOPPED; pid = -1; return; }
        List<ProcessHandle> children = p.descendants().toList();

        int timeoutSec = def.getShutdownTimeoutSec();
        appendLog("--- stopping (SIGTERM, timeout=" + timeoutSec + "s) ---");
        p.destroy(); // SIGTERM

        try {
            if (!p.waitFor(timeoutSec, TimeUnit.SECONDS)) {
                appendLog("--- graceful timeout after " + timeoutSec
                        + "s, sending SIGKILL ---");
                p.destroyForcibly();
                // Give the OS a moment to reclaim ports and file handles
                p.waitFor(3, TimeUnit.SECONDS);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            p.destroyForcibly();
        }

        stopChildren(children);
        exitCode = p.exitValue();
        process  = null;
        state    = State.STOPPED;
        pid      = -1;
        appendLog("--- stopped (code=" + exitCode + ") ---");
        log.info("Stopped {} exitCode={}", def.getName(), exitCode);
    }

    // ── log streaming ─────────────────────────────────────────────────────

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(0L);
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(()    -> emitters.remove(emitter));
        emitter.onError(e       -> emitters.remove(emitter));

        List<String> snapshot;
        synchronized (logBuffer) { snapshot = new ArrayList<>(logBuffer); }
        try {
            for (String line : snapshot) emitter.send(SseEmitter.event().data(line));
        } catch (Exception ignored) {}
        return emitter;
    }

    // ── accessors ─────────────────────────────────────────────────────────

    public ServiceDefinition definition() { return def; }
    public State    getState()            { return state; }
    public long     getPid()              { return pid; }
    public Instant  getStartedAt()        { return startedAt; }
    public Integer  getExitCode()         { return exitCode; }
    public boolean  isRunning()           { return state == State.RUNNING; }

    // ── internals ─────────────────────────────────────────────────────────

    private List<String> buildCommand() {
        if (def.isNative()) {
            // Native binary: command list is used verbatim
            return new ArrayList<>(def.getCommand());
        }
        // Java JAR
        List<String> cmd = new ArrayList<>();
        cmd.add("java");
        cmd.add("-jar");
        cmd.add(def.getJar());
        cmd.addAll(def.getArgs());
        return cmd;
    }

    private void appendLog(String line) {
        synchronized (logBuffer) {
            if (logBuffer.size() >= LOG_BUFFER) logBuffer.pollFirst();
            logBuffer.addLast(line);
        }
        for (SseEmitter e : emitters) {
            try { e.send(SseEmitter.event().data(line)); }
            catch (Exception ex) { emitters.remove(e); }
        }
    }

    /**
     * Kills any existing process whose command line contains {@code pattern},
     * then waits briefly for port/file-handle release.
     * Runs before start() so the new process doesn't race a dying orphan.
     */
    private void evictOrphan(String pattern) {
        if (pattern == null || pattern.isBlank()) return;
        try {
            Process pgrep = new ProcessBuilder("pgrep", "-f", pattern)
                    .redirectErrorStream(true).start();
            String pids = new String(pgrep.getInputStream().readAllBytes()).trim();
            pgrep.waitFor(3, TimeUnit.SECONDS);
            if (pids.isBlank()) return;

            long self = ProcessHandle.current().pid();
            for (String pidStr : pids.split("\\s+")) {
                pidStr = pidStr.trim();
                if (pidStr.isEmpty()) continue;
                long orphan = Long.parseLong(pidStr);
                if (orphan == self) continue;

                appendLog("--- evicting orphan pid=" + orphan + " ---");
                ProcessHandle.of(orphan).ifPresent(ph -> {
                    ph.destroy(); // SIGTERM first
                    try {
                        ph.onExit().get(def.getShutdownTimeoutSec(), TimeUnit.SECONDS);
                    } catch (Exception ignored) {
                        if (ph.isAlive()) {
                            appendLog("--- orphan " + orphan + " did not exit, force-killing ---");
                            ph.destroyForcibly();
                        }
                    }
                });
            }
            Thread.sleep(500); // brief pause for OS resource release
        } catch (Exception e) {
            log.warn("evictOrphan({}) failed: {}", pattern,
                    e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
        }
    }

    private void stopChildren(List<ProcessHandle> children) {
        if (children.isEmpty()) return;
        for (ProcessHandle child : children) {
            if (child.isAlive()) {
                appendLog("--- stopping child pid=" + child.pid() + " ---");
                child.destroy();
            }
        }
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
        for (ProcessHandle child : children) {
            if (!child.isAlive()) continue;
            long remaining = deadline - System.nanoTime();
            if (remaining <= 0) break;
            try {
                child.onExit().get(remaining, TimeUnit.NANOSECONDS);
            } catch (Exception ignored) {
                // Escalation below handles stubborn children.
            }
        }
        for (ProcessHandle child : children) {
            if (child.isAlive()) {
                appendLog("--- child " + child.pid() + " did not exit, force-killing ---");
                child.destroyForcibly();
            }
        }
    }

    private void reconcileState() {
        Process p = process;
        if (p == null) {
            if (state != State.STOPPED) { state = State.STOPPED; pid = -1; }
            return;
        }
        if (p.isAlive()) {
            if (state == State.STOPPED) state = State.RUNNING;
            return;
        }
        exitCode = p.exitValue();
        process  = null;
        state    = State.STOPPED;
        pid      = -1;
    }
}
