package com.example.control.service;

import java.util.List;

public class ServiceDefinition {
    private String id;
    private String name;
    private String description;
    private String group = "infrastructure"; // "vehicle" | "infrastructure"
    private String jar;
    private List<String> args = List.of();
    private String workDir;
    private int displayOrder;

    public String getId()          { return id; }
    public void setId(String id)   { this.id = id; }

    public String getName()             { return name; }
    public void setName(String name)    { this.name = name; }

    public String getDescription()                  { return description; }
    public void setDescription(String description)  { this.description = description; }

    public String getJar()           { return jar; }
    public void setJar(String jar)   { this.jar = jar; }

    public List<String> getArgs()             { return args; }
    public void setArgs(List<String> args)    { this.args = args; }

    public String getWorkDir()              { return workDir; }
    public void setWorkDir(String workDir)  { this.workDir = workDir; }

    public String getGroup()                  { return group; }
    public void   setGroup(String group)      { this.group = group; }

    public int  getDisplayOrder()             { return displayOrder; }
    public void setDisplayOrder(int order)    { this.displayOrder = order; }
}
