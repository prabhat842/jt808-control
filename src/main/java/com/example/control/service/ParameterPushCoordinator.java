package com.example.control.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@Service
public class ParameterPushCoordinator {
    private static final Charset GBK = Charset.forName("GBK");

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .build();

    @Value("${server-url:http://127.0.0.1:8888}")
    private String serverUrl;

    public ParameterPushCoordinator(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    public PushDispatchResult dispatch(String profileId, String deviceId, String requestedBy) {
        String pushId = "push-" + UUID.randomUUID().toString().substring(0, 8);
        jdbc.update("""
                INSERT INTO garuda_registry.device_parameter_push
                    (push_id, device_id, profile_id, push_status, requested_by, result_message)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                pushId,
                deviceId.trim(),
                profileId,
                "queued",
                requestedBy,
                "Queued for JT808 parameter push");

        String terminalId = jdbc.queryForObject("""
                SELECT terminal_id
                FROM garuda_registry.terminal_device
                WHERE device_id = ?
                """, String.class, deviceId);
        if (terminalId == null || terminalId.isBlank()) {
            return failPush(pushId, "device terminal id not found");
        }

        List<ProfileItem> items = jdbc.query("""
                SELECT parameter_id, value_kind, value_text
                FROM garuda_registry.terminal_parameter_item
                WHERE profile_id = ?
                ORDER BY parameter_id
                """, (rs, i) -> new ProfileItem(
                rs.getInt("parameter_id"),
                rs.getString("value_kind"),
                rs.getString("value_text")
        ), profileId);

        if (items.isEmpty()) {
            return failPush(pushId, "parameter profile has no items to push");
        }

        byte[] body;
        try {
            body = encodeParameterSettingBody(items);
        } catch (IllegalArgumentException ex) {
            return failPush(pushId, ex.getMessage());
        }

        RawCommandResult result;
        try {
            result = sendRawCommand(terminalId, 0x8103, body);
        } catch (Exception ex) {
            return failPush(pushId, "push dispatch failed: " + safeMessage(ex));
        }

        if (!result.accepted()) {
            return failPush(pushId, result.offline()
                    ? "terminal offline"
                    : "platform rejected JT808 parameter push");
        }

        jdbc.update("""
                UPDATE garuda_registry.device_parameter_push
                   SET command_id = ?,
                       push_status = ?,
                       result_message = ?,
                       completed_at = NULL
                 WHERE push_id = ?
                """,
                result.commandId(),
                "sent",
                "JT808 0x8103 sent to terminal",
                pushId);

        return new PushDispatchResult(pushId, result.commandId(), "sent", "JT808 0x8103 sent to terminal", false, true);
    }

    @Scheduled(fixedDelay = 3000)
    public void syncPushStatuses() {
        Map<Long, Integer> commandResults;
        try {
            commandResults = fetchCommandResults();
        } catch (Exception ex) {
            return;
        }
        if (commandResults.isEmpty()) {
            return;
        }

        List<PendingPush> pending = jdbc.query("""
                SELECT push_id, command_id, push_status
                FROM garuda_registry.device_parameter_push
                WHERE command_id IS NOT NULL
                  AND push_status IN ('queued', 'sent')
                ORDER BY requested_at DESC
                """, (rs, i) -> new PendingPush(
                rs.getString("push_id"),
                rs.getLong("command_id"),
                rs.getString("push_status")
        ));

        for (PendingPush push : pending) {
            Integer response = commandResults.get(push.commandId());
            if (response == null) {
                if ("queued".equals(push.pushStatus())) {
                    jdbc.update("""
                            UPDATE garuda_registry.device_parameter_push
                               SET push_status = 'sent',
                                   result_message = COALESCE(result_message, 'JT808 0x8103 sent to terminal')
                             WHERE push_id = ?
                            """, push.pushId());
                }
                continue;
            }

            String status = response == 0 ? "acked" : "failed";
            String message = response == 0
                    ? "terminal acknowledged JT808 0x8103"
                    : "terminal returned JT808 general response " + response;
            jdbc.update("""
                    UPDATE garuda_registry.device_parameter_push
                       SET push_status = ?,
                           completed_at = ?,
                           result_message = ?
                     WHERE push_id = ?
                    """,
                    status,
                    Instant.now(),
                    message,
                    push.pushId());
        }
    }

    private PushDispatchResult failPush(String pushId, String message) {
        jdbc.update("""
                UPDATE garuda_registry.device_parameter_push
                   SET push_status = 'failed',
                       completed_at = ?,
                       result_message = ?
                 WHERE push_id = ?
                """,
                Instant.now(),
                message,
                pushId);
        return new PushDispatchResult(pushId, 0, "failed", message, false, false);
    }

    private RawCommandResult sendRawCommand(String terminalId, int messageId, byte[] body) throws Exception {
        String bodyHex = HexFormat.of().formatHex(body);
        String terminal = URLEncoder.encode(terminalId, StandardCharsets.UTF_8);
        URI uri = URI.create(serverUrl + "/api/raw?terminal=" + terminal
                + "&messageId=0x" + Integer.toHexString(messageId).toUpperCase()
                + "&bodyHex=" + bodyHex);
        HttpRequest req = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(4))
                .GET()
                .build();
        HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() / 100 != 2) {
            throw new IOException("raw command failed: HTTP " + resp.statusCode());
        }
        JsonNode node = mapper.readTree(resp.body());
        return new RawCommandResult(
                node.path("accepted").asBoolean(false),
                node.path("offline").asBoolean(false),
                node.path("commandId").asLong(0),
                node.path("sequence").asInt(0)
        );
    }

    private Map<Long, Integer> fetchCommandResults() throws Exception {
        URI uri = URI.create(serverUrl + "/api/commands");
        HttpRequest req = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(4))
                .GET()
                .build();
        HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() / 100 != 2) {
            return Map.of();
        }
        JsonNode root = mapper.readTree(resp.body());
        Map<Long, Integer> results = new HashMap<>();
        if (root.isArray()) {
            for (JsonNode node : root) {
                if (!node.hasNonNull("commandId")) continue;
                if (!node.hasNonNull("response") || node.get("response").isNull()) continue;
                results.put(node.path("commandId").asLong(), node.path("response").asInt());
            }
        }
        return results;
    }

    private static byte[] encodeParameterSettingBody(List<ProfileItem> items) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(items.size());
        for (ProfileItem item : items) {
            byte[] value = encodeParameterValue(item.valueKind(), item.valueText());
            out.write(ByteBuffer.allocate(4).putInt(item.parameterId()).array(), 0, 4);
            if (value.length > 255) {
                throw new IllegalArgumentException("parameter " + item.parameterId() + " exceeds 255 bytes");
            }
            out.write(value.length);
            out.write(value, 0, value.length);
        }
        return out.toByteArray();
    }

    private static byte[] encodeParameterValue(String valueKind, String valueText) {
        String kind = normalizeValueKind(valueKind);
        String text = Objects.requireNonNullElse(valueText, "").trim();
        return switch (kind) {
            case "byte" -> new byte[]{(byte) parseUnsignedLong(text, 0xFFL)};
            case "word" -> ByteBuffer.allocate(2).putShort((short) parseUnsignedLong(text, 0xFFFFL)).array();
            case "dword" -> ByteBuffer.allocate(4).putInt((int) parseUnsignedLong(text, 0xFFFF_FFFFL)).array();
            case "string" -> text.getBytes(GBK);
            case "bytes" -> parseHexBytes(text);
            default -> throw new IllegalArgumentException("unsupported parameter value kind: " + valueKind);
        };
    }

    private static byte[] parseHexBytes(String value) {
        String hex = value.replaceAll("[^0-9A-Fa-f]", "");
        if (hex.isEmpty()) {
            return new byte[0];
        }
        if ((hex.length() & 1) != 0) {
            throw new IllegalArgumentException("hex value must have even length");
        }
        return HexFormat.of().parseHex(hex);
    }

    private static long parseUnsignedLong(String value, long max) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("parameter value is required");
        }
        long parsed;
        try {
            parsed = Long.decode(value.trim());
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("invalid numeric parameter value: " + value);
        }
        if (parsed < 0 || parsed > max) {
            throw new IllegalArgumentException("parameter value out of range: " + value);
        }
        return parsed;
    }

    private static String normalizeValueKind(String valueKind) {
        if (valueKind == null) return "";
        return "bytes8".equals(valueKind.trim()) ? "bytes" : valueKind.trim();
    }

    private static String safeMessage(Throwable ex) {
        String msg = ex.getMessage();
        return msg == null || msg.isBlank() ? ex.getClass().getSimpleName() : msg;
    }

    private record ProfileItem(int parameterId, String valueKind, String valueText) {}
    private record PendingPush(String pushId, long commandId, String pushStatus) {}
    private record RawCommandResult(boolean accepted, boolean offline, long commandId, int sequence) {}

    public record PushDispatchResult(String pushId, long commandId, String pushStatus, String resultMessage,
                                     boolean accepted, boolean offline) {}
}
