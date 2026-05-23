package com.example.control.api;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/registry")
public class RegistryApi {
    private final JdbcTemplate jdbc;

    public RegistryApi(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/summary")
    public Map<String, Integer> summary() {
        return Map.of(
                "organizations", count("garuda_registry.org_unit"),
                "devices",       count("garuda_registry.terminal_device"),
                "vehicles",      count("garuda_registry.vehicle_asset"),
                "drivers",       count("garuda_registry.driver_profile"),
                "profiles",      count("garuda_registry.terminal_parameter_profile")
        );
    }

    @GetMapping("/org-units")
    public Object orgUnits() {
        return jdbc.query("""
                SELECT
                    o.org_id         AS org_id,
                    o.parent_org_id  AS parent_org_id,
                    o.org_code       AS org_code,
                    o.org_name       AS org_name,
                    o.org_kind       AS org_kind,
                    o.status         AS status,
                    o.contact_name   AS contact_name,
                    o.contact_phone  AS contact_phone,
                    p.org_name       AS parent_org_name,
                    COUNT(DISTINCT d.device_id)  AS device_count,
                    COUNT(DISTINCT v.vehicle_id) AS vehicle_count
                FROM garuda_registry.org_unit o
                LEFT JOIN garuda_registry.org_unit p
                    ON p.org_id = o.parent_org_id
                LEFT JOIN garuda_registry.terminal_device d
                    ON d.org_id = o.org_id
                LEFT JOIN garuda_registry.vehicle_asset v
                    ON v.org_id = o.org_id
                GROUP BY o.org_id, o.parent_org_id, o.org_code, o.org_name, o.org_kind,
                         o.status, o.contact_name, o.contact_phone, p.org_name
                ORDER BY o.parent_org_id NULLS FIRST, o.org_name
                """, (rs, i) -> row(
                "orgId", rs.getString("org_id"),
                "parentOrgId", rs.getString("parent_org_id"),
                "orgCode", rs.getString("org_code"),
                "orgName", rs.getString("org_name"),
                "orgKind", rs.getString("org_kind"),
                "status", rs.getString("status"),
                "contactName", rs.getString("contact_name"),
                "contactPhone", rs.getString("contact_phone"),
                "parentOrgName", rs.getString("parent_org_name"),
                "deviceCount", rs.getInt("device_count"),
                "vehicleCount", rs.getInt("vehicle_count")
        ));
    }

    @GetMapping("/devices")
    public Object devices() {
        return jdbc.query("""
                SELECT
                    d.device_id         AS device_id,
                    d.org_id            AS org_id,
                    o.org_name          AS org_name,
                    d.terminal_id       AS terminal_id,
                    d.sim               AS sim,
                    d.protocol_family   AS protocol_family,
                    d.protocol_version  AS protocol_version,
                    d.device_model      AS device_model,
                    d.manufacturer_id   AS manufacturer_id,
                    d.firmware_version  AS firmware_version,
                    d.hardware_version  AS hardware_version,
                    d.install_status    AS install_status,
                    d.lifecycle_status  AS lifecycle_status,
                    d.last_seen_at      AS last_seen_at,
                    v.plate_number      AS plate_number,
                    COUNT(c.channel_id) AS channel_count
                FROM garuda_registry.terminal_device d
                JOIN garuda_registry.org_unit o
                    ON o.org_id = d.org_id
                LEFT JOIN garuda_registry.vehicle_asset v
                    ON v.device_id = d.device_id
                LEFT JOIN garuda_registry.media_channel c
                    ON c.device_id = d.device_id
                GROUP BY d.device_id, d.org_id, o.org_name, d.terminal_id, d.sim,
                         d.protocol_family, d.protocol_version, d.device_model,
                         d.manufacturer_id, d.firmware_version, d.hardware_version,
                         d.install_status, d.lifecycle_status, d.last_seen_at, v.plate_number
                ORDER BY d.terminal_id
                """, (rs, i) -> row(
                "deviceId", rs.getString("device_id"),
                "orgId", rs.getString("org_id"),
                "orgName", rs.getString("org_name"),
                "terminalId", rs.getString("terminal_id"),
                "sim", rs.getString("sim"),
                "protocolFamily", rs.getString("protocol_family"),
                "protocolVersion", rs.getString("protocol_version"),
                "deviceModel", rs.getString("device_model"),
                "manufacturerId", rs.getString("manufacturer_id"),
                "firmwareVersion", rs.getString("firmware_version"),
                "hardwareVersion", rs.getString("hardware_version"),
                "installStatus", rs.getString("install_status"),
                "lifecycleStatus", rs.getString("lifecycle_status"),
                "lastSeenAt", nullableTimestamp(rs, "last_seen_at"),
                "plateNumber", rs.getString("plate_number"),
                "channelCount", rs.getInt("channel_count")
        ));
    }

    @GetMapping("/vehicles")
    public Object vehicles() {
        return jdbc.query("""
                SELECT
                    v.vehicle_id       AS vehicle_id,
                    v.org_id           AS org_id,
                    o.org_name         AS org_name,
                    v.device_id        AS device_id,
                    d.terminal_id      AS terminal_id,
                    v.plate_number     AS plate_number,
                    v.plate_color      AS plate_color,
                    v.vin              AS vin,
                    v.vehicle_kind     AS vehicle_kind,
                    v.fuel_kind        AS fuel_kind,
                    v.capacity_tons    AS capacity_tons,
                    v.operation_status AS operation_status,
                    a.driver_id        AS current_driver_id,
                    p.display_name     AS current_driver_name
                FROM garuda_registry.vehicle_asset v
                JOIN garuda_registry.org_unit o
                    ON o.org_id = v.org_id
                LEFT JOIN garuda_registry.terminal_device d
                    ON d.device_id = v.device_id
                LEFT JOIN garuda_registry.driver_vehicle_assignment a
                    ON a.vehicle_id = v.vehicle_id AND a.ended_at IS NULL
                LEFT JOIN garuda_registry.driver_profile p
                    ON p.driver_id = a.driver_id
                ORDER BY v.plate_number
                """, (rs, i) -> row(
                "vehicleId", rs.getString("vehicle_id"),
                "orgId", rs.getString("org_id"),
                "orgName", rs.getString("org_name"),
                "deviceId", rs.getString("device_id"),
                "terminalId", rs.getString("terminal_id"),
                "plateNumber", rs.getString("plate_number"),
                "plateColor", rs.getString("plate_color"),
                "vin", rs.getString("vin"),
                "vehicleKind", rs.getString("vehicle_kind"),
                "fuelKind", rs.getString("fuel_kind"),
                "capacityTons", nullableDouble(rs, "capacity_tons"),
                "operationStatus", rs.getString("operation_status"),
                "currentDriverId", rs.getString("current_driver_id"),
                "currentDriverName", rs.getString("current_driver_name")
        ));
    }

    @GetMapping("/drivers")
    public Object drivers() {
        return jdbc.query("""
                SELECT
                    p.driver_id                 AS driver_id,
                    p.org_id                    AS org_id,
                    o.org_name                  AS org_name,
                    p.display_name              AS display_name,
                    p.phone                     AS phone,
                    p.license_number            AS license_number,
                    p.license_class             AS license_class,
                    p.license_expires_on        AS license_expires_on,
                    p.qualification_number      AS qualification_number,
                    p.qualification_expires_on  AS qualification_expires_on,
                    p.employment_status         AS employment_status,
                    p.risk_label                AS risk_label,
                    v.plate_number              AS current_vehicle_plate
                FROM garuda_registry.driver_profile p
                JOIN garuda_registry.org_unit o
                    ON o.org_id = p.org_id
                LEFT JOIN garuda_registry.driver_vehicle_assignment a
                    ON a.driver_id = p.driver_id AND a.ended_at IS NULL
                LEFT JOIN garuda_registry.vehicle_asset v
                    ON v.vehicle_id = a.vehicle_id
                ORDER BY p.display_name
                """, (rs, i) -> row(
                "driverId", rs.getString("driver_id"),
                "orgId", rs.getString("org_id"),
                "orgName", rs.getString("org_name"),
                "displayName", rs.getString("display_name"),
                "phone", rs.getString("phone"),
                "licenseNumber", rs.getString("license_number"),
                "licenseClass", rs.getString("license_class"),
                "licenseExpiresOn", nullableDate(rs, "license_expires_on"),
                "qualificationNumber", rs.getString("qualification_number"),
                "qualificationExpiresOn", nullableDate(rs, "qualification_expires_on"),
                "employmentStatus", rs.getString("employment_status"),
                "riskLabel", rs.getString("risk_label"),
                "currentVehiclePlate", rs.getString("current_vehicle_plate")
        ));
    }

    @GetMapping("/parameter-profiles")
    public Object parameterProfiles() {
        return jdbc.query("""
                SELECT
                    p.profile_id       AS profile_id,
                    p.org_id           AS org_id,
                    o.org_name         AS org_name,
                    p.profile_name     AS profile_name,
                    p.description      AS description,
                    p.profile_status   AS profile_status,
                    COUNT(i.item_id)   AS item_count
                FROM garuda_registry.terminal_parameter_profile p
                JOIN garuda_registry.org_unit o
                    ON o.org_id = p.org_id
                LEFT JOIN garuda_registry.terminal_parameter_item i
                    ON i.profile_id = p.profile_id
                GROUP BY p.profile_id, p.org_id, o.org_name, p.profile_name,
                         p.description, p.profile_status
                ORDER BY p.profile_name
                """, (rs, i) -> row(
                "profileId", rs.getString("profile_id"),
                "orgId", rs.getString("org_id"),
                "orgName", rs.getString("org_name"),
                "profileName", rs.getString("profile_name"),
                "description", rs.getString("description"),
                "profileStatus", rs.getString("profile_status"),
                "itemCount", rs.getInt("item_count")
        ));
    }

    @PostMapping("/org-units")
    public ResponseEntity<Map<String, Object>> createOrgUnit(@RequestBody OrgUnitPayload payload) {
        String orgId = blankToNull(payload.orgId()) != null ? payload.orgId() : generateOrgId(payload.orgCode());
        validateOrgPayload(payload, orgId);
        if (exists("SELECT COUNT(*) FROM garuda_registry.org_unit WHERE org_id = ?", orgId)) {
            return conflict("organization already exists: " + orgId);
        }
        jdbc.update("""
                INSERT INTO garuda_registry.org_unit
                    (org_id, parent_org_id, org_code, org_name, org_kind, status, contact_name, contact_phone, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                orgId,
                blankToNull(payload.parentOrgId()),
                payload.orgCode().trim(),
                payload.orgName().trim(),
                defaultIfBlank(payload.orgKind(), "fleet"),
                defaultIfBlank(payload.status(), "active"),
                blankToNull(payload.contactName()),
                blankToNull(payload.contactPhone()),
                blankToNull(payload.notes()));
        return ok(Map.of("result", "created", "orgId", orgId));
    }

    @PutMapping("/org-units/{orgId}")
    public ResponseEntity<Map<String, Object>> updateOrgUnit(
            @PathVariable String orgId,
            @RequestBody OrgUnitPayload payload) {
        validateOrgPayload(payload, orgId);
        if (!exists("SELECT COUNT(*) FROM garuda_registry.org_unit WHERE org_id = ?", orgId)) {
            return notFound("organization not found: " + orgId);
        }
        jdbc.update("""
                UPDATE garuda_registry.org_unit
                   SET parent_org_id = ?,
                       org_code = ?,
                       org_name = ?,
                       org_kind = ?,
                       status = ?,
                       contact_name = ?,
                       contact_phone = ?,
                       notes = ?,
                       updated_at = CURRENT_TIMESTAMP
                 WHERE org_id = ?
                """,
                blankToNull(payload.parentOrgId()),
                payload.orgCode().trim(),
                payload.orgName().trim(),
                defaultIfBlank(payload.orgKind(), "fleet"),
                defaultIfBlank(payload.status(), "active"),
                blankToNull(payload.contactName()),
                blankToNull(payload.contactPhone()),
                blankToNull(payload.notes()),
                orgId);
        return ok(Map.of("result", "updated", "orgId", orgId));
    }

    @DeleteMapping("/org-units/{orgId}")
    public ResponseEntity<Map<String, Object>> deleteOrgUnit(@PathVariable String orgId) {
        if (!exists("SELECT COUNT(*) FROM garuda_registry.org_unit WHERE org_id = ?", orgId)) {
            return notFound("organization not found: " + orgId);
        }
        if (exists("SELECT COUNT(*) FROM garuda_registry.org_unit WHERE parent_org_id = ?", orgId)) {
            return conflict("organization has child organizations");
        }
        if (exists("SELECT COUNT(*) FROM garuda_registry.terminal_device WHERE org_id = ?", orgId)
                || exists("SELECT COUNT(*) FROM garuda_registry.vehicle_asset WHERE org_id = ?", orgId)
                || exists("SELECT COUNT(*) FROM garuda_registry.driver_profile WHERE org_id = ?", orgId)
                || exists("SELECT COUNT(*) FROM garuda_registry.terminal_parameter_profile WHERE org_id = ?", orgId)) {
            return conflict("organization still owns devices, vehicles, drivers, or parameter profiles");
        }
        jdbc.update("DELETE FROM garuda_registry.org_unit WHERE org_id = ?", orgId);
        return ok(Map.of("result", "deleted", "orgId", orgId));
    }

    @PostMapping("/devices")
    public ResponseEntity<Map<String, Object>> createDevice(@RequestBody DevicePayload payload) {
        String deviceId = blankToNull(payload.deviceId()) != null ? payload.deviceId() : generateDeviceId(payload.terminalId());
        validateDevicePayload(payload, deviceId);
        if (exists("SELECT COUNT(*) FROM garuda_registry.terminal_device WHERE device_id = ?", deviceId)) {
            return conflict("device already exists: " + deviceId);
        }
        jdbc.update("""
                INSERT INTO garuda_registry.terminal_device
                    (device_id, org_id, terminal_id, sim, protocol_family, protocol_version, device_model,
                     manufacturer_id, firmware_version, hardware_version, install_status, lifecycle_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                deviceId,
                payload.orgId().trim(),
                payload.terminalId().trim(),
                payload.sim().trim(),
                defaultIfBlank(payload.protocolFamily(), "JT808"),
                defaultIfBlank(payload.protocolVersion(), "JT/T 808-2013"),
                blankToNull(payload.deviceModel()),
                blankToNull(payload.manufacturerId()),
                blankToNull(payload.firmwareVersion()),
                blankToNull(payload.hardwareVersion()),
                defaultIfBlank(payload.installStatus(), "inventory"),
                defaultIfBlank(payload.lifecycleStatus(), "active"));
        return ok(Map.of("result", "created", "deviceId", deviceId));
    }

    @PutMapping("/devices/{deviceId}")
    public ResponseEntity<Map<String, Object>> updateDevice(
            @PathVariable String deviceId,
            @RequestBody DevicePayload payload) {
        validateDevicePayload(payload, deviceId);
        if (!exists("SELECT COUNT(*) FROM garuda_registry.terminal_device WHERE device_id = ?", deviceId)) {
            return notFound("device not found: " + deviceId);
        }
        jdbc.update("""
                UPDATE garuda_registry.terminal_device
                   SET org_id = ?,
                       terminal_id = ?,
                       sim = ?,
                       protocol_family = ?,
                       protocol_version = ?,
                       device_model = ?,
                       manufacturer_id = ?,
                       firmware_version = ?,
                       hardware_version = ?,
                       install_status = ?,
                       lifecycle_status = ?,
                       updated_at = CURRENT_TIMESTAMP
                 WHERE device_id = ?
                """,
                payload.orgId().trim(),
                payload.terminalId().trim(),
                payload.sim().trim(),
                defaultIfBlank(payload.protocolFamily(), "JT808"),
                defaultIfBlank(payload.protocolVersion(), "JT/T 808-2013"),
                blankToNull(payload.deviceModel()),
                blankToNull(payload.manufacturerId()),
                blankToNull(payload.firmwareVersion()),
                blankToNull(payload.hardwareVersion()),
                defaultIfBlank(payload.installStatus(), "inventory"),
                defaultIfBlank(payload.lifecycleStatus(), "active"),
                deviceId);
        return ok(Map.of("result", "updated", "deviceId", deviceId));
    }

    @DeleteMapping("/devices/{deviceId}")
    public ResponseEntity<Map<String, Object>> deleteDevice(@PathVariable String deviceId) {
        if (!exists("SELECT COUNT(*) FROM garuda_registry.terminal_device WHERE device_id = ?", deviceId)) {
            return notFound("device not found: " + deviceId);
        }
        if (exists("SELECT COUNT(*) FROM garuda_registry.vehicle_asset WHERE device_id = ?", deviceId)
                || exists("SELECT COUNT(*) FROM garuda_registry.media_channel WHERE device_id = ?", deviceId)
                || exists("SELECT COUNT(*) FROM garuda_registry.device_parameter_push WHERE device_id = ?", deviceId)) {
            return conflict("device is still referenced by vehicles, media channels, or parameter pushes");
        }
        jdbc.update("DELETE FROM garuda_registry.terminal_device WHERE device_id = ?", deviceId);
        return ok(Map.of("result", "deleted", "deviceId", deviceId));
    }

    @PostMapping("/vehicles")
    public ResponseEntity<Map<String, Object>> createVehicle(@RequestBody VehiclePayload payload) {
        String vehicleId = blankToNull(payload.vehicleId()) != null ? payload.vehicleId() : generateVehicleId(payload.plateNumber());
        validateVehiclePayload(payload, vehicleId);
        if (exists("SELECT COUNT(*) FROM garuda_registry.vehicle_asset WHERE vehicle_id = ?", vehicleId)) {
            return conflict("vehicle already exists: " + vehicleId);
        }
        jdbc.update("""
                INSERT INTO garuda_registry.vehicle_asset
                    (vehicle_id, org_id, device_id, plate_number, plate_color, vin, vehicle_kind, fuel_kind, capacity_tons, operation_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                vehicleId,
                payload.orgId().trim(),
                blankToNull(payload.deviceId()),
                payload.plateNumber().trim(),
                defaultIfBlank(payload.plateColor(), "blue"),
                blankToNull(payload.vin()),
                defaultIfBlank(payload.vehicleKind(), "commercial"),
                blankToNull(payload.fuelKind()),
                payload.capacityTons(),
                defaultIfBlank(payload.operationStatus(), "active"));
        return ok(Map.of("result", "created", "vehicleId", vehicleId));
    }

    @PutMapping("/vehicles/{vehicleId}")
    public ResponseEntity<Map<String, Object>> updateVehicle(
            @PathVariable String vehicleId,
            @RequestBody VehiclePayload payload) {
        validateVehiclePayload(payload, vehicleId);
        if (!exists("SELECT COUNT(*) FROM garuda_registry.vehicle_asset WHERE vehicle_id = ?", vehicleId)) {
            return notFound("vehicle not found: " + vehicleId);
        }
        jdbc.update("""
                UPDATE garuda_registry.vehicle_asset
                   SET org_id = ?,
                       device_id = ?,
                       plate_number = ?,
                       plate_color = ?,
                       vin = ?,
                       vehicle_kind = ?,
                       fuel_kind = ?,
                       capacity_tons = ?,
                       operation_status = ?,
                       updated_at = CURRENT_TIMESTAMP
                 WHERE vehicle_id = ?
                """,
                payload.orgId().trim(),
                blankToNull(payload.deviceId()),
                payload.plateNumber().trim(),
                defaultIfBlank(payload.plateColor(), "blue"),
                blankToNull(payload.vin()),
                defaultIfBlank(payload.vehicleKind(), "commercial"),
                blankToNull(payload.fuelKind()),
                payload.capacityTons(),
                defaultIfBlank(payload.operationStatus(), "active"),
                vehicleId);
        return ok(Map.of("result", "updated", "vehicleId", vehicleId));
    }

    @DeleteMapping("/vehicles/{vehicleId}")
    public ResponseEntity<Map<String, Object>> deleteVehicle(@PathVariable String vehicleId) {
        if (!exists("SELECT COUNT(*) FROM garuda_registry.vehicle_asset WHERE vehicle_id = ?", vehicleId)) {
            return notFound("vehicle not found: " + vehicleId);
        }
        if (exists("SELECT COUNT(*) FROM garuda_registry.driver_vehicle_assignment WHERE vehicle_id = ? AND ended_at IS NULL", vehicleId)) {
            return conflict("vehicle has an active driver assignment");
        }
        jdbc.update("DELETE FROM garuda_registry.vehicle_asset WHERE vehicle_id = ?", vehicleId);
        return ok(Map.of("result", "deleted", "vehicleId", vehicleId));
    }

    @PostMapping("/drivers")
    public ResponseEntity<Map<String, Object>> createDriver(@RequestBody DriverPayload payload) {
        String driverId = blankToNull(payload.driverId()) != null ? payload.driverId() : generateDriverId(payload.displayName());
        validateDriverPayload(payload, driverId);
        if (exists("SELECT COUNT(*) FROM garuda_registry.driver_profile WHERE driver_id = ?", driverId)) {
            return conflict("driver already exists: " + driverId);
        }
        jdbc.update("""
                INSERT INTO garuda_registry.driver_profile
                    (driver_id, org_id, display_name, phone, license_number, license_class, license_expires_on,
                     qualification_number, qualification_expires_on, employment_status, risk_label)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                driverId,
                payload.orgId().trim(),
                payload.displayName().trim(),
                blankToNull(payload.phone()),
                blankToNull(payload.licenseNumber()),
                blankToNull(payload.licenseClass()),
                parseDate(payload.licenseExpiresOn()),
                blankToNull(payload.qualificationNumber()),
                parseDate(payload.qualificationExpiresOn()),
                defaultIfBlank(payload.employmentStatus(), "active"),
                defaultIfBlank(payload.riskLabel(), "normal"));
        return ok(Map.of("result", "created", "driverId", driverId));
    }

    @PutMapping("/drivers/{driverId}")
    public ResponseEntity<Map<String, Object>> updateDriver(
            @PathVariable String driverId,
            @RequestBody DriverPayload payload) {
        validateDriverPayload(payload, driverId);
        if (!exists("SELECT COUNT(*) FROM garuda_registry.driver_profile WHERE driver_id = ?", driverId)) {
            return notFound("driver not found: " + driverId);
        }
        jdbc.update("""
                UPDATE garuda_registry.driver_profile
                   SET org_id = ?,
                       display_name = ?,
                       phone = ?,
                       license_number = ?,
                       license_class = ?,
                       license_expires_on = ?,
                       qualification_number = ?,
                       qualification_expires_on = ?,
                       employment_status = ?,
                       risk_label = ?,
                       updated_at = CURRENT_TIMESTAMP
                 WHERE driver_id = ?
                """,
                payload.orgId().trim(),
                payload.displayName().trim(),
                blankToNull(payload.phone()),
                blankToNull(payload.licenseNumber()),
                blankToNull(payload.licenseClass()),
                parseDate(payload.licenseExpiresOn()),
                blankToNull(payload.qualificationNumber()),
                parseDate(payload.qualificationExpiresOn()),
                defaultIfBlank(payload.employmentStatus(), "active"),
                defaultIfBlank(payload.riskLabel(), "normal"),
                driverId);
        return ok(Map.of("result", "updated", "driverId", driverId));
    }

    @DeleteMapping("/drivers/{driverId}")
    public ResponseEntity<Map<String, Object>> deleteDriver(@PathVariable String driverId) {
        if (!exists("SELECT COUNT(*) FROM garuda_registry.driver_profile WHERE driver_id = ?", driverId)) {
            return notFound("driver not found: " + driverId);
        }
        if (exists("SELECT COUNT(*) FROM garuda_registry.driver_vehicle_assignment WHERE driver_id = ? AND ended_at IS NULL", driverId)) {
            return conflict("driver has an active vehicle assignment");
        }
        jdbc.update("DELETE FROM garuda_registry.driver_profile WHERE driver_id = ?", driverId);
        return ok(Map.of("result", "deleted", "driverId", driverId));
    }

    private int count(String table) {
        Integer value = jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
        return value == null ? 0 : value;
    }

    private boolean exists(String sql, Object value) {
        Integer count = jdbc.queryForObject(sql, Integer.class, value);
        return count != null && count > 0;
    }

    private static String generateOrgId(String orgCode) {
        String base = slug(orgCode);
        return base.isBlank() ? "org-" + java.util.UUID.randomUUID().toString().substring(0, 8) : "org-" + base;
    }

    private static String generateDeviceId(String terminalId) {
        String base = slug(terminalId);
        return base.isBlank() ? "dev-" + java.util.UUID.randomUUID().toString().substring(0, 8) : "dev-" + base;
    }

    private static String slug(String value) {
        if (value == null) return "";
        return value.trim().toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("^-+|-+$", "");
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private static String defaultIfBlank(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private static String generateVehicleId(String plateNumber) {
        String base = slug(plateNumber);
        return base.isBlank() ? "veh-" + java.util.UUID.randomUUID().toString().substring(0, 8) : "veh-" + base;
    }

    private static String generateDriverId(String displayName) {
        String base = slug(displayName);
        return base.isBlank() ? "drv-" + java.util.UUID.randomUUID().toString().substring(0, 8) : "drv-" + base;
    }

    private static java.sql.Date parseDate(String value) {
        String trimmed = blankToNull(value);
        if (trimmed == null) return null;
        try {
            return java.sql.Date.valueOf(LocalDate.parse(trimmed));
        } catch (Exception e) {
            throw new IllegalArgumentException("invalid date: " + trimmed);
        }
    }

    private static void validateOrgPayload(OrgUnitPayload payload, String orgId) {
        if (payload == null) throw new IllegalArgumentException("request body is required");
        if (orgId == null || orgId.isBlank()) throw new IllegalArgumentException("orgId/orgCode is required");
        if (payload.orgCode() == null || payload.orgCode().isBlank()) throw new IllegalArgumentException("orgCode is required");
        if (payload.orgName() == null || payload.orgName().isBlank()) throw new IllegalArgumentException("orgName is required");
    }

    private static void validateDevicePayload(DevicePayload payload, String deviceId) {
        if (payload == null) throw new IllegalArgumentException("request body is required");
        if (deviceId == null || deviceId.isBlank()) throw new IllegalArgumentException("deviceId/terminalId is required");
        if (payload.orgId() == null || payload.orgId().isBlank()) throw new IllegalArgumentException("orgId is required");
        if (payload.terminalId() == null || payload.terminalId().isBlank()) throw new IllegalArgumentException("terminalId is required");
        if (payload.sim() == null || payload.sim().isBlank()) throw new IllegalArgumentException("sim is required");
    }

    private static void validateVehiclePayload(VehiclePayload payload, String vehicleId) {
        if (payload == null) throw new IllegalArgumentException("request body is required");
        if (vehicleId == null || vehicleId.isBlank()) throw new IllegalArgumentException("vehicleId/plateNumber is required");
        if (payload.orgId() == null || payload.orgId().isBlank()) throw new IllegalArgumentException("orgId is required");
        if (payload.plateNumber() == null || payload.plateNumber().isBlank()) throw new IllegalArgumentException("plateNumber is required");
    }

    private static void validateDriverPayload(DriverPayload payload, String driverId) {
        if (payload == null) throw new IllegalArgumentException("request body is required");
        if (driverId == null || driverId.isBlank()) throw new IllegalArgumentException("driverId/displayName is required");
        if (payload.orgId() == null || payload.orgId().isBlank()) throw new IllegalArgumentException("orgId is required");
        if (payload.displayName() == null || payload.displayName().isBlank()) throw new IllegalArgumentException("displayName is required");
    }

    private ResponseEntity<Map<String, Object>> ok(Map<String, Object> body) {
        return ResponseEntity.ok(body);
    }

    private ResponseEntity<Map<String, Object>> conflict(String message) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", message));
    }

    private ResponseEntity<Map<String, Object>> notFound(String message) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", message));
    }

    private static Map<String, Object> row(Object... pairs) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) {
            out.put((String) pairs[i], pairs[i + 1]);
        }
        return out;
    }

    private static String nullableTimestamp(ResultSet rs, String column) throws SQLException {
        java.sql.Timestamp value = rs.getTimestamp(column);
        return value == null ? null : value.toInstant().toString();
    }

    private static String nullableDate(ResultSet rs, String column) throws SQLException {
        java.sql.Date value = rs.getDate(column);
        return value == null ? null : value.toLocalDate().toString();
    }

    private static Double nullableDouble(ResultSet rs, String column) throws SQLException {
        double value = rs.getDouble(column);
        return rs.wasNull() ? null : value;
    }

    public record OrgUnitPayload(
            String orgId,
            String parentOrgId,
            String orgCode,
            String orgName,
            String orgKind,
            String status,
            String contactName,
            String contactPhone,
            String notes) {}

    public record DevicePayload(
            String deviceId,
            String orgId,
            String terminalId,
            String sim,
            String protocolFamily,
            String protocolVersion,
            String deviceModel,
            String manufacturerId,
            String firmwareVersion,
            String hardwareVersion,
            String installStatus,
            String lifecycleStatus) {}

    public record VehiclePayload(
            String vehicleId,
            String orgId,
            String deviceId,
            String plateNumber,
            String plateColor,
            String vin,
            String vehicleKind,
            String fuelKind,
            Double capacityTons,
            String operationStatus) {}

    public record DriverPayload(
            String driverId,
            String orgId,
            String displayName,
            String phone,
            String licenseNumber,
            String licenseClass,
            String licenseExpiresOn,
            String qualificationNumber,
            String qualificationExpiresOn,
            String employmentStatus,
            String riskLabel) {}
}
