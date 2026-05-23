-- Development seed data for the in-memory Garuda Registry.
-- Keep this file small: it exists only to make the Management Center useful
-- before import flows and CRUD screens are finished.

INSERT INTO garuda_registry.org_unit
    (org_id, parent_org_id, org_code, org_name, org_kind, status, contact_name, contact_phone)
VALUES
    ('org-goatai', NULL, 'GOATAI', 'GoatAI Fleet', 'tenant', 'active', 'Operations Desk', '+91-00000-00000'),
    ('org-jamshedpur', 'org-goatai', 'JAMSHEDPUR', 'Jamshedpur Depot', 'depot', 'active', 'Depot Lead', '+91-00000-00001')
ON CONFLICT DO NOTHING;

INSERT INTO garuda_registry.terminal_device
    (device_id, org_id, terminal_id, sim, protocol_family, protocol_version, device_model, manufacturer_id,
     firmware_version, hardware_version, install_status, lifecycle_status)
VALUES
    ('dev-00000000000000000001', 'org-jamshedpur', '00000000000000000001', '00000000000000000001',
     'JT808', 'JT/T 808-2013', 'GarudaCam H5', 'GARUDA', '0.1.0', 'sim', 'installed', 'active'),
    ('dev-00000000000000000002', 'org-jamshedpur', '00000000000000000002', '00000000000000000002',
     'JT808', 'JT/T 808-2013', 'GarudaCam H5', 'GARUDA', '0.1.0', 'sim', 'inventory', 'active'),
    ('dev-00000000000000000003', 'org-jamshedpur', '00000000000000000003', '00000000000000000003',
     'JT808', 'JT/T 808-2013', 'GarudaCam H5', 'GARUDA', '0.1.0', 'sim', 'inventory', 'active')
ON CONFLICT DO NOTHING;

INSERT INTO garuda_registry.vehicle_asset
    (vehicle_id, org_id, device_id, plate_number, plate_color, vin, vehicle_kind, fuel_kind, operation_status)
VALUES
    ('veh-garuda-001', 'org-jamshedpur', 'dev-00000000000000000001', 'GARUDA-001', 'yellow', 'SIMVIN00000000001',
     'commercial', 'diesel', 'active'),
    ('veh-garuda-002', 'org-jamshedpur', 'dev-00000000000000000002', 'GARUDA-002', 'yellow', 'SIMVIN00000000002',
     'commercial', 'diesel', 'parked'),
    ('veh-garuda-003', 'org-jamshedpur', 'dev-00000000000000000003', 'GARUDA-003', 'yellow', 'SIMVIN00000000003',
     'commercial', 'diesel', 'parked')
ON CONFLICT DO NOTHING;

INSERT INTO garuda_registry.driver_profile
    (driver_id, org_id, display_name, phone, license_number, license_class, license_expires_on,
     qualification_number, qualification_expires_on, employment_status, risk_label)
VALUES
    ('drv-arjun-singh', 'org-jamshedpur', 'Arjun Singh', '+91-90000-00001', 'JH-DRV-0001', 'HMV',
     DATE '2029-12-31', 'Q-JH-0001', DATE '2028-12-31', 'active', 'normal'),
    ('drv-meera-kumar', 'org-jamshedpur', 'Meera Kumar', '+91-90000-00002', 'JH-DRV-0002', 'HMV',
     DATE '2029-12-31', 'Q-JH-0002', DATE '2028-12-31', 'active', 'watch')
ON CONFLICT DO NOTHING;

INSERT INTO garuda_registry.driver_vehicle_assignment
    (assignment_id, vehicle_id, driver_id, device_id, started_at, source)
VALUES
    ('asn-garuda-001', 'veh-garuda-001', 'drv-arjun-singh', 'dev-00000000000000000001', CURRENT_TIMESTAMP, 'manual')
ON CONFLICT DO NOTHING;

INSERT INTO garuda_registry.terminal_parameter_profile
    (profile_id, org_id, profile_name, description, profile_status)
VALUES
    ('profile-camera-host', 'org-jamshedpur', 'Camera host defaults',
     'Heartbeat and location cadence used by the local camera-host simulator.', 'active')
ON CONFLICT DO NOTHING;

INSERT INTO garuda_registry.terminal_parameter_item
    (item_id, profile_id, parameter_id, value_kind, value_text)
VALUES
    ('item-camera-host-heartbeat', 'profile-camera-host', 1, 'dword', '30'),
    ('item-camera-host-ack-timeout', 'profile-camera-host', 2, 'dword', '30'),
    ('item-camera-host-location', 'profile-camera-host', 41, 'dword', '5')
ON CONFLICT DO NOTHING;

INSERT INTO garuda_registry.media_channel
    (channel_id, device_id, channel_number, channel_name, channel_kind, enabled)
VALUES
    ('ch-dev-1-front', 'dev-00000000000000000001', 1, 'Front camera', 'video', TRUE),
    ('ch-dev-1-driver', 'dev-00000000000000000001', 2, 'Driver camera', 'dms', TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO garuda_registry.operator_role
    (role_id, role_name, role_scope)
VALUES
    ('role-admin', 'Fleet Administrator', 'admin'),
    ('role-operator', 'Fleet Operator', 'operator')
ON CONFLICT DO NOTHING;

INSERT INTO garuda_registry.operator_account
    (account_id, org_id, role_id, login_name, display_name, account_status)
VALUES
    ('acct-local-admin', 'org-goatai', 'role-admin', 'local-admin', 'Local Admin', 'active')
ON CONFLICT DO NOTHING;
