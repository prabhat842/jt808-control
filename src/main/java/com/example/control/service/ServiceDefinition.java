package com.example.control.service;

import java.util.List;

public class ServiceDefinition {
    private String       id;
    private String       name;
    private String       description;
    private String       group           = "infrastructure";
    private String       jar;                        // Java service: path to fat JAR
    private List<String> args            = List.of(); // extra JVM args (java -jar only)
    private List<String> command         = List.of(); // native binary: full command list
    private String       workDir;
    private int          displayOrder;
    private int          shutdownTimeoutSec = 10;    // seconds before SIGKILL

    public String getId()                           { return id; }
    public void   setId(String id)                  { this.id = id; }

    public String getName()                         { return name; }
    public void   setName(String name)              { this.name = name; }

    public String getDescription()                  { return description; }
    public void   setDescription(String d)          { this.description = d; }

    public String getJar()                          { return jar; }
    public void   setJar(String jar)                { this.jar = jar; }

    public List<String> getArgs()                   { return args; }
    public void         setArgs(List<String> args)  { this.args = args; }

    public List<String> getCommand()                      { return command; }
    public void         setCommand(List<String> command)  { this.command = command; }

    public String getWorkDir()                      { return workDir; }
    public void   setWorkDir(String workDir)        { this.workDir = workDir; }

    public String getGroup()                        { return group; }
    public void   setGroup(String group)            { this.group = group; }

    public int  getDisplayOrder()                   { return displayOrder; }
    public void setDisplayOrder(int order)          { this.displayOrder = order; }

    public int  getShutdownTimeoutSec()             { return shutdownTimeoutSec; }
    public void setShutdownTimeoutSec(int t)        { this.shutdownTimeoutSec = t; }

    /** True when this service is started via a native binary (not java -jar). */
    public boolean isNative() {
        return command != null && !command.isEmpty();
    }

    /**
     * The string used by evictOrphan() to find stray processes.
     * For JAR services: the jar path. For native: the binary path (first token).
     */
    public String processPattern() {
        return isNative() ? command.get(0) : jar;
    }
}
