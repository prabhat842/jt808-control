package com.example.control;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

@SpringBootApplication
@EnableScheduling
public class ControlPanelApplication {
    public static void main(String[] args) {
        loadLocalEnv();
        SpringApplication.run(ControlPanelApplication.class, args);
    }

    private static void loadLocalEnv() {
        List<Path> candidates = List.of(
                Path.of(".env.local"),
                Path.of(".env"),
                Path.of("ui/.env.local"),
                Path.of("ui/.env")
        );
        for (Path path : candidates) {
            if (!Files.isRegularFile(path)) continue;
            try {
                for (String line : Files.readAllLines(path)) {
                    parseEnvLine(line);
                }
            } catch (IOException e) {
                System.err.println("Unable to read local env file: " + path);
            }
        }
        publishMapboxToken();
    }

    private static void parseEnvLine(String line) {
        String trimmed = line.trim();
        if (trimmed.isEmpty() || trimmed.startsWith("#")) return;
        if (trimmed.startsWith("export ")) trimmed = trimmed.substring("export ".length()).trim();
        int equals = trimmed.indexOf('=');
        if (equals <= 0) return;
        String key = trimmed.substring(0, equals).trim();
        if (!key.matches("[A-Za-z_][A-Za-z0-9_]*")) return;
        if (System.getenv(key) != null || System.getProperty(key) != null) return;
        System.setProperty(key, stripQuotes(trimmed.substring(equals + 1).trim()));
    }

    private static String stripQuotes(String value) {
        if (value.length() >= 2) {
            char first = value.charAt(0);
            char last = value.charAt(value.length() - 1);
            if ((first == '"' && last == '"') || (first == '\'' && last == '\'')) {
                return value.substring(1, value.length() - 1);
            }
        }
        return value;
    }

    private static void publishMapboxToken() {
        String token = firstNonBlank(
                System.getenv("MAPBOX_TOKEN"),
                System.getProperty("MAPBOX_TOKEN"),
                System.getenv("VITE_MAPBOX_TOKEN"),
                System.getProperty("VITE_MAPBOX_TOKEN")
        );
        if (token == null) return;
        setIfMissing("MAPBOX_TOKEN", token);
        setIfMissing("ui.mapbox-token", token);
        setIfMissing("ui.mapboxToken", token);
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private static void setIfMissing(String key, String value) {
        if (System.getProperty(key) == null && System.getenv(key) == null) {
            System.setProperty(key, value);
        }
    }
}
