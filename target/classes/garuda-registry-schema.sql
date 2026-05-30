-- Garuda Registry schema
--
-- Purpose:
--   Transactional management data for Garuda Fleet Command.
--
-- Development target:
--   H2 in-memory database. Keep this schema separate from ClickHouse telemetry
--   tables (`vehicle_gps`, `vehicle_alarm`, `vehicle_alarm_file`).
--
-- Naming:
--   The schema is intentionally named `garuda_registry` so the product model is
--   Garuda-native and does not mirror external fleet-console terminology.

CREATE SCHEMA IF NOT EXISTS garuda_registry;

-- Organization tree used by fleet, device, driver, and report filters.
CREATE TABLE IF NOT EXISTS garuda_registry.org_unit (
    org_id          VARCHAR(64) PRIMARY KEY,
    parent_org_id   VARCHAR(64),
    org_code        VARCHAR(64) NOT NULL UNIQUE,
    org_name        VARCHAR(160) NOT NULL,
    org_kind        VARCHAR(32) NOT NULL DEFAULT 'fleet',
    status          VARCHAR(24) NOT NULL DEFAULT 'active',
    contact_name    VARCHAR(120),
    contact_phone   VARCHAR(40),
    notes           VARCHAR(1000),
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_org_unit_parent
        FOREIGN KEY (parent_org_id) REFERENCES garuda_registry.org_unit(org_id),
    CONSTRAINT ck_org_unit_kind
        CHECK (org_kind IN ('tenant', 'fleet', 'depot', 'contractor', 'other')),
    CONSTRAINT ck_org_unit_status
        CHECK (status IN ('active', 'suspended', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_org_unit_parent
    ON garuda_registry.org_unit(parent_org_id);

CREATE INDEX IF NOT EXISTS idx_org_unit_name
    ON garuda_registry.org_unit(org_name);

-- Persistent device registry. This is different from the runtime
-- TerminalRegistry, which only knows currently connected terminals.
CREATE TABLE IF NOT EXISTS garuda_registry.terminal_device (
    device_id           VARCHAR(64) PRIMARY KEY,
    org_id              VARCHAR(64) NOT NULL,
    terminal_id         VARCHAR(32) NOT NULL UNIQUE,
    sim                 VARCHAR(32) NOT NULL UNIQUE,
    protocol_family     VARCHAR(32) NOT NULL DEFAULT 'JT808',
    protocol_version    VARCHAR(32) NOT NULL DEFAULT 'JT/T 808-2013',
    device_model        VARCHAR(80),
    manufacturer_id     VARCHAR(32),
    firmware_version    VARCHAR(80),
    hardware_version    VARCHAR(80),
    install_status      VARCHAR(24) NOT NULL DEFAULT 'inventory',
    lifecycle_status    VARCHAR(24) NOT NULL DEFAULT 'active',
    installed_at        TIMESTAMP,
    last_seen_at        TIMESTAMP,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_terminal_device_org
        FOREIGN KEY (org_id) REFERENCES garuda_registry.org_unit(org_id),
    CONSTRAINT ck_terminal_device_install_status
        CHECK (install_status IN ('inventory', 'installed', 'maintenance', 'retired')),
    CONSTRAINT ck_terminal_device_lifecycle_status
        CHECK (lifecycle_status IN ('active', 'disabled', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_terminal_device_org
    ON garuda_registry.terminal_device(org_id);

CREATE INDEX IF NOT EXISTS idx_terminal_device_terminal
    ON garuda_registry.terminal_device(terminal_id);

CREATE INDEX IF NOT EXISTS idx_terminal_device_sim
    ON garuda_registry.terminal_device(sim);

-- Vehicle master data. This is the stable asset record that joins telemetry,
-- alarms, drivers, and terminal devices.
CREATE TABLE IF NOT EXISTS garuda_registry.vehicle_asset (
    vehicle_id          VARCHAR(64) PRIMARY KEY,
    org_id              VARCHAR(64) NOT NULL,
    device_id           VARCHAR(64),
    plate_number        VARCHAR(32) NOT NULL UNIQUE,
    plate_color         VARCHAR(24) NOT NULL DEFAULT 'blue',
    vin                 VARCHAR(40),
    vehicle_kind        VARCHAR(40) NOT NULL DEFAULT 'commercial',
    fuel_kind           VARCHAR(24),
    capacity_tons       DECIMAL(10, 2),
    operation_status    VARCHAR(24) NOT NULL DEFAULT 'active',
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_vehicle_asset_org
        FOREIGN KEY (org_id) REFERENCES garuda_registry.org_unit(org_id),
    CONSTRAINT fk_vehicle_asset_device
        FOREIGN KEY (device_id) REFERENCES garuda_registry.terminal_device(device_id),
    CONSTRAINT ck_vehicle_asset_plate_color
        CHECK (plate_color IN ('blue', 'yellow', 'black', 'white', 'green', 'other')),
    CONSTRAINT ck_vehicle_asset_operation_status
        CHECK (operation_status IN ('active', 'parked', 'maintenance', 'retired'))
);

CREATE INDEX IF NOT EXISTS idx_vehicle_asset_org
    ON garuda_registry.vehicle_asset(org_id);

CREATE INDEX IF NOT EXISTS idx_vehicle_asset_device
    ON garuda_registry.vehicle_asset(device_id);

-- Driver master data used by driver portrait, reports, and duty assignment.
CREATE TABLE IF NOT EXISTS garuda_registry.driver_profile (
    driver_id              VARCHAR(64) PRIMARY KEY,
    org_id                 VARCHAR(64) NOT NULL,
    display_name           VARCHAR(160) NOT NULL,
    phone                  VARCHAR(40),
    license_number         VARCHAR(80),
    license_class          VARCHAR(32),
    license_expires_on     DATE,
    qualification_number   VARCHAR(80),
    qualification_expires_on DATE,
    employment_status      VARCHAR(24) NOT NULL DEFAULT 'active',
    risk_label             VARCHAR(24) NOT NULL DEFAULT 'normal',
    created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_driver_profile_org
        FOREIGN KEY (org_id) REFERENCES garuda_registry.org_unit(org_id),
    CONSTRAINT ck_driver_profile_employment_status
        CHECK (employment_status IN ('active', 'off_duty', 'suspended', 'archived')),
    CONSTRAINT ck_driver_profile_risk_label
        CHECK (risk_label IN ('normal', 'watch', 'high_risk'))
);

CREATE INDEX IF NOT EXISTS idx_driver_profile_org
    ON garuda_registry.driver_profile(org_id);

CREATE INDEX IF NOT EXISTS idx_driver_profile_name
    ON garuda_registry.driver_profile(display_name);

-- Assignment history. A row with `ended_at IS NULL` is the current duty link.
CREATE TABLE IF NOT EXISTS garuda_registry.driver_vehicle_assignment (
    assignment_id   VARCHAR(64) PRIMARY KEY,
    vehicle_id      VARCHAR(64) NOT NULL,
    driver_id       VARCHAR(64) NOT NULL,
    device_id       VARCHAR(64),
    started_at      TIMESTAMP NOT NULL,
    ended_at        TIMESTAMP,
    source          VARCHAR(32) NOT NULL DEFAULT 'manual',
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_driver_vehicle_assignment_vehicle
        FOREIGN KEY (vehicle_id) REFERENCES garuda_registry.vehicle_asset(vehicle_id),
    CONSTRAINT fk_driver_vehicle_assignment_driver
        FOREIGN KEY (driver_id) REFERENCES garuda_registry.driver_profile(driver_id),
    CONSTRAINT fk_driver_vehicle_assignment_device
        FOREIGN KEY (device_id) REFERENCES garuda_registry.terminal_device(device_id),
    CONSTRAINT ck_driver_vehicle_assignment_source
        CHECK (source IN ('manual', 'ic_card', 'import', 'api'))
);

CREATE INDEX IF NOT EXISTS idx_driver_vehicle_assignment_vehicle
    ON garuda_registry.driver_vehicle_assignment(vehicle_id, started_at);

CREATE INDEX IF NOT EXISTS idx_driver_vehicle_assignment_driver
    ON garuda_registry.driver_vehicle_assignment(driver_id, started_at);

-- Parameter profile groups JT808 parameters so operators can apply a named
-- policy to one or many devices.
CREATE TABLE IF NOT EXISTS garuda_registry.terminal_parameter_catalog (
    parameter_id      INTEGER PRIMARY KEY,
    hex_id            VARCHAR(12) NOT NULL UNIQUE,
    parameter_name    VARCHAR(160) NOT NULL,
    short_description VARCHAR(500) NOT NULL,
    long_description  VARCHAR(2000),
    value_kind        VARCHAR(24) NOT NULL,
    unit              VARCHAR(32),
    min_value         VARCHAR(64),
    max_value         VARCHAR(64),
    default_value     VARCHAR(1000),
    category          VARCHAR(48) NOT NULL,
    business_impact   VARCHAR(1000),
    alarm_related     BOOLEAN NOT NULL DEFAULT FALSE,
    requires_restart  BOOLEAN NOT NULL DEFAULT FALSE,
    table_ref         VARCHAR(80) NOT NULL DEFAULT 'JT808 Table 12',
    CONSTRAINT ck_terminal_parameter_catalog_kind
        CHECK (value_kind IN ('byte', 'word', 'dword', 'string', 'bytes', 'bytes8'))
);

CREATE INDEX IF NOT EXISTS idx_terminal_parameter_catalog_category
    ON garuda_registry.terminal_parameter_catalog(category);

CREATE TABLE IF NOT EXISTS garuda_registry.terminal_parameter_profile (
    profile_id      VARCHAR(64) PRIMARY KEY,
    org_id          VARCHAR(64),
    device_id       VARCHAR(64),
    profile_scope   VARCHAR(24) NOT NULL DEFAULT 'org',
    profile_name    VARCHAR(160) NOT NULL,
    description     VARCHAR(1000),
    profile_status  VARCHAR(24) NOT NULL DEFAULT 'draft',
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_terminal_parameter_profile_org
        FOREIGN KEY (org_id) REFERENCES garuda_registry.org_unit(org_id),
    CONSTRAINT fk_terminal_parameter_profile_device
        FOREIGN KEY (device_id) REFERENCES garuda_registry.terminal_device(device_id),
    CONSTRAINT uq_terminal_parameter_profile_name
        UNIQUE (profile_scope, org_id, device_id, profile_name),
    CONSTRAINT ck_terminal_parameter_profile_scope
        CHECK (profile_scope IN ('global', 'org', 'terminal')),
    CONSTRAINT ck_terminal_parameter_profile_status
        CHECK (profile_status IN ('draft', 'active', 'archived')),
    CONSTRAINT ck_terminal_parameter_profile_target
        CHECK (
            (profile_scope = 'global' AND org_id IS NULL AND device_id IS NULL)
            OR (profile_scope = 'org' AND org_id IS NOT NULL AND device_id IS NULL)
            OR (profile_scope = 'terminal' AND org_id IS NULL AND device_id IS NOT NULL)
        )
);

CREATE TABLE IF NOT EXISTS garuda_registry.terminal_parameter_item (
    item_id       VARCHAR(64) PRIMARY KEY,
    profile_id    VARCHAR(64) NOT NULL,
    parameter_id  INTEGER NOT NULL,
    value_kind    VARCHAR(24) NOT NULL,
    value_text    VARCHAR(1000) NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_terminal_parameter_item_profile
        FOREIGN KEY (profile_id) REFERENCES garuda_registry.terminal_parameter_profile(profile_id)
            ON DELETE CASCADE,
    CONSTRAINT uq_terminal_parameter_item_param
        UNIQUE (profile_id, parameter_id),
    CONSTRAINT ck_terminal_parameter_item_value_kind
        CHECK (value_kind IN ('byte', 'word', 'dword', 'string', 'bytes'))
);

CREATE INDEX IF NOT EXISTS idx_terminal_parameter_item_profile
    ON garuda_registry.terminal_parameter_item(profile_id);

-- Audit of profile applications to devices. The actual platform command result
-- can be linked later to TerminalRegistry command ids.
CREATE TABLE IF NOT EXISTS garuda_registry.device_parameter_push (
    push_id         VARCHAR(64) PRIMARY KEY,
    device_id       VARCHAR(64) NOT NULL,
    profile_id      VARCHAR(64) NOT NULL,
    command_id      BIGINT,
    push_status     VARCHAR(24) NOT NULL DEFAULT 'queued',
    requested_by    VARCHAR(120),
    requested_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at    TIMESTAMP,
    result_message  VARCHAR(1000),
    CONSTRAINT fk_device_parameter_push_device
        FOREIGN KEY (device_id) REFERENCES garuda_registry.terminal_device(device_id),
    CONSTRAINT fk_device_parameter_push_profile
        FOREIGN KEY (profile_id) REFERENCES garuda_registry.terminal_parameter_profile(profile_id),
    CONSTRAINT ck_device_parameter_push_status
        CHECK (push_status IN ('queued', 'sent', 'acked', 'failed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_device_parameter_push_device
    ON garuda_registry.device_parameter_push(device_id, requested_at);

-- Declares camera/media channels visible in Monitoring Center and Media.
CREATE TABLE IF NOT EXISTS garuda_registry.media_channel (
    channel_id      VARCHAR(64) PRIMARY KEY,
    device_id       VARCHAR(64) NOT NULL,
    channel_number  INTEGER NOT NULL,
    channel_name    VARCHAR(120) NOT NULL,
    channel_kind    VARCHAR(32) NOT NULL DEFAULT 'video',
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_media_channel_device
        FOREIGN KEY (device_id) REFERENCES garuda_registry.terminal_device(device_id),
    CONSTRAINT uq_media_channel_number
        UNIQUE (device_id, channel_number),
    CONSTRAINT ck_media_channel_kind
        CHECK (channel_kind IN ('video', 'audio', 'intercom', 'adas', 'dms'))
);

CREATE INDEX IF NOT EXISTS idx_media_channel_device
    ON garuda_registry.media_channel(device_id);

-- Tracks CSV/API imports shown in the Management Center.
CREATE TABLE IF NOT EXISTS garuda_registry.registry_import_job (
    import_id       VARCHAR(64) PRIMARY KEY,
    import_kind     VARCHAR(32) NOT NULL,
    source_name     VARCHAR(240),
    import_status   VARCHAR(24) NOT NULL DEFAULT 'pending',
    total_rows      INTEGER NOT NULL DEFAULT 0,
    accepted_rows   INTEGER NOT NULL DEFAULT 0,
    rejected_rows   INTEGER NOT NULL DEFAULT 0,
    requested_by    VARCHAR(120),
    started_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at     TIMESTAMP,
    error_summary   VARCHAR(2000),
    CONSTRAINT ck_registry_import_job_kind
        CHECK (import_kind IN ('organizations', 'devices', 'vehicles', 'drivers', 'parameters')),
    CONSTRAINT ck_registry_import_job_status
        CHECK (import_status IN ('pending', 'running', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_registry_import_job_kind
    ON garuda_registry.registry_import_job(import_kind, started_at);

-- Minimal operator/role model for future Management Center permissions.
CREATE TABLE IF NOT EXISTS garuda_registry.operator_role (
    role_id      VARCHAR(64) PRIMARY KEY,
    role_name    VARCHAR(120) NOT NULL UNIQUE,
    role_scope   VARCHAR(32) NOT NULL DEFAULT 'operator',
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_operator_role_scope
        CHECK (role_scope IN ('admin', 'operator', 'viewer'))
);

CREATE TABLE IF NOT EXISTS garuda_registry.operator_account (
    account_id      VARCHAR(64) PRIMARY KEY,
    org_id          VARCHAR(64),
    role_id         VARCHAR(64) NOT NULL,
    login_name      VARCHAR(120) NOT NULL UNIQUE,
    display_name    VARCHAR(160) NOT NULL,
    account_status  VARCHAR(24) NOT NULL DEFAULT 'active',
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_operator_account_org
        FOREIGN KEY (org_id) REFERENCES garuda_registry.org_unit(org_id),
    CONSTRAINT fk_operator_account_role
        FOREIGN KEY (role_id) REFERENCES garuda_registry.operator_role(role_id),
    CONSTRAINT ck_operator_account_status
        CHECK (account_status IN ('active', 'locked', 'disabled', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_operator_account_org
    ON garuda_registry.operator_account(org_id);
