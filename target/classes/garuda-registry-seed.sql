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

INSERT INTO garuda_registry.terminal_parameter_catalog
    (parameter_id, hex_id, parameter_name, short_description, long_description, value_kind, unit, min_value, max_value, default_value, category, business_impact, alarm_related, requires_restart)
VALUES
    (1, '0x0001', 'Heartbeat interval', 'Terminal heartbeat sending interval.', 'Controls how often the terminal sends 0x0002 heartbeat packets. Longer intervals reduce traffic but slow stale-session detection.', 'dword', 'seconds', '1', NULL, '30', 'Connectivity', 'Affects online/offline detection latency and control-plane load.', FALSE, FALSE),
    (2, '0x0002', 'TCP response timeout', 'TCP message response timeout.', 'Time the terminal waits for platform responses before treating a TCP command as timed out.', 'dword', 'seconds', '1', NULL, '30', 'Connectivity', 'Impacts command retry behavior and perceived command failure timing.', FALSE, FALSE),
    (3, '0x0003', 'TCP resend count', 'TCP message resend count.', 'Maximum resend attempts for TCP messages before giving up.', 'dword', 'count', '0', NULL, '3', 'Connectivity', 'Higher values improve unreliable-link tolerance but increase traffic.', FALSE, FALSE),
    (4, '0x0004', 'UDP response timeout', 'UDP message response timeout.', 'Time the terminal waits for platform responses over UDP.', 'dword', 'seconds', '1', NULL, '5', 'Connectivity', 'Used only when UDP transport is enabled.', FALSE, FALSE),
    (5, '0x0005', 'UDP resend count', 'UDP message resend count.', 'Maximum resend attempts for UDP messages before giving up.', 'dword', 'count', '0', NULL, '3', 'Connectivity', 'Used only when UDP transport is enabled.', FALSE, FALSE),
    (6, '0x0006', 'SMS response timeout', 'SMS message response timeout.', 'Time the terminal waits for platform responses over SMS.', 'dword', 'seconds', '1', NULL, '30', 'Connectivity', 'Fallback transport setting for SMS-capable terminals.', FALSE, FALSE),
    (7, '0x0007', 'SMS resend count', 'SMS message resend count.', 'Maximum resend attempts for SMS messages before giving up.', 'dword', 'count', '0', NULL, '3', 'Connectivity', 'Fallback transport setting for SMS-capable terminals.', FALSE, FALSE),
    (16, '0x0010', 'Main server APN', 'Main server dial access point.', 'Wireless APN or PPP dial number used by the terminal to reach the main platform.', 'string', NULL, NULL, NULL, '', 'Network', 'Incorrect APN can prevent device connectivity.', FALSE, TRUE),
    (17, '0x0011', 'Main server username', 'Main server wireless dialing username.', 'Username used for main server wireless network dialing.', 'string', NULL, NULL, NULL, '', 'Network', 'Incorrect credentials can prevent device connectivity.', FALSE, TRUE),
    (18, '0x0012', 'Main server password', 'Main server wireless dialing password.', 'Password used for main server wireless network dialing.', 'string', NULL, NULL, NULL, '', 'Network', 'Incorrect credentials can prevent device connectivity.', FALSE, TRUE),
    (19, '0x0013', 'Main server address', 'Main server IP, ID, or domain name.', 'Primary JT808 platform address used by the terminal. Usually takes effect on reconnect.', 'string', NULL, NULL, NULL, '127.0.0.1', 'Network', 'Changing this redirects terminal signaling traffic.', FALSE, TRUE),
    (24, '0x0018', 'Server TCP port', 'Main server TCP port.', 'TCP port used for JT808 signaling on the main platform.', 'dword', 'port', '1', '65535', '7611', 'Network', 'Wrong port disconnects the terminal from the platform.', FALSE, TRUE),
    (25, '0x0019', 'Server UDP port', 'Main server UDP port.', 'UDP port used when UDP transport is enabled.', 'dword', 'port', '1', '65535', '7611', 'Network', 'Wrong port breaks UDP signaling.', FALSE, TRUE),
    (32, '0x0020', 'Position reporting strategy', 'Timing, distance, or mixed reporting strategy.', '0 means timing report, 1 means distance report, 2 means both timing and distance.', 'dword', NULL, '0', '2', '0', 'Reporting', 'Determines how GPS telemetry volume is produced.', FALSE, FALSE),
    (33, '0x0021', 'Position reporting scheme', 'ACC/login based reporting scheme.', '0 follows ACC status; 1 checks login status first and then ACC status.', 'dword', NULL, '0', '1', '0', 'Reporting', 'Controls when position reports are emitted.', FALSE, FALSE),
    (34, '0x0022', 'No-driver report interval', 'Report interval while driver is not logged in.', 'Used when driver login state affects reporting cadence.', 'dword', 'seconds', '1', NULL, '60', 'Reporting', 'Can reduce or increase telemetry while driver identity is absent.', FALSE, FALSE),
    (39, '0x0027', 'Dormancy report interval', 'Report interval during dormancy.', 'Position report interval while terminal is dormant.', 'dword', 'seconds', '1', NULL, '300', 'Reporting', 'Controls telemetry during low-power or parked states.', FALSE, FALSE),
    (40, '0x0028', 'Emergency report interval', 'Report interval during emergency alarm.', 'Position report interval while emergency alarm is active.', 'dword', 'seconds', '1', NULL, '10', 'Reporting', 'Lower values improve alarm tracking at the cost of more traffic.', TRUE, FALSE),
    (41, '0x0029', 'Default report interval', 'Default location report interval.', 'Primary periodic GPS report cadence used during normal operation.', 'dword', 'seconds', '1', NULL, '5', 'Reporting', 'Core telemetry frequency. Very low values increase server and database load.', FALSE, FALSE),
    (44, '0x002C', 'Default report distance', 'Default distance reporting interval.', 'Distance threshold for sending location reports in distance-based reporting.', 'dword', 'meters', '1', NULL, '200', 'Reporting', 'Controls telemetry density for moving vehicles.', FALSE, FALSE),
    (48, '0x0030', 'Inflection angle', 'Route inflection angle threshold.', 'Angle threshold for reporting route turning points. Protocol requires less than 180 degrees.', 'dword', 'degrees', '0', '179', '30', 'Reporting', 'Affects route detail and trip reconstruction.', FALSE, FALSE),
    (80, '0x0050', 'Alarm block mask', 'Alarm blocked bit field.', 'Each bit corresponds to an alarm flag. When a bit is 1, the corresponding alarm is blocked.', 'dword', 'bitmask', '0', NULL, '0', 'Alarm', 'Directly suppresses alarm generation or reporting for configured alarm types.', TRUE, FALSE),
    (81, '0x0051', 'Alarm SMS mask', 'Alarm text/SMS switch bit field.', 'Each bit controls whether alarm SMS/text notification is sent for the corresponding alarm.', 'dword', 'bitmask', '0', NULL, '0', 'Alarm', 'Controls external notification behavior for alarm types.', TRUE, FALSE),
    (82, '0x0052', 'Alarm shooting mask', 'Alarm-triggered shooting switch bit field.', 'Each bit controls whether camera capture is triggered by the corresponding alarm.', 'dword', 'bitmask', '0', NULL, '0', 'Alarm', 'Controls alarm-linked media capture.', TRUE, FALSE),
    (83, '0x0053', 'Alarm shooting storage mask', 'Alarm shooting storage/upload bit field.', 'Each bit controls whether alarm pictures are stored or uploaded in real time.', 'dword', 'bitmask', '0', NULL, '0', 'Alarm', 'Controls alarm media evidence handling.', TRUE, FALSE),
    (84, '0x0054', 'Key alarm mask', 'Key alarm bit field.', 'Each bit marks whether the corresponding alarm is treated as a key alarm.', 'dword', 'bitmask', '0', NULL, '0', 'Alarm', 'Changes alarm priority and operational response.', TRUE, FALSE),
    (85, '0x0055', 'Maximum speed', 'Highest allowed speed.', 'Speed threshold used by overspeed alarm logic.', 'dword', 'km/h', '0', NULL, '120', 'Speed & Safety', 'Vehicles below this threshold should not fire overspeed alarms.', TRUE, FALSE),
    (86, '0x0056', 'Overspeed duration', 'Duration above max speed before alarm.', 'How long speed must remain above maximum speed before overspeed alarm is fired.', 'dword', 'seconds', '0', NULL, '30', 'Speed & Safety', 'Prevents short spikes from generating overspeed alarms.', TRUE, FALSE),
    (91, '0x005B', 'Overspeed warning difference', 'Difference between overspeed alarm and warning.', 'Delta below the overspeed alarm threshold used for warning behavior. Unit is 1/10 km/h.', 'word', '0.1 km/h', '0', NULL, '50', 'Speed & Safety', 'Defines the early warning band before overspeed alarm.', TRUE, FALSE),
    (92, '0x005C', 'Fatigue warning difference', 'Difference between fatigue alarm and warning.', 'Delta before fatigue driving alarm used for warning behavior.', 'word', 'seconds', '1', NULL, '300', 'Speed & Safety', 'Defines early warning before fatigue alarm.', TRUE, FALSE),
    (100, '0x0064', 'Timing shooting control', 'Camera timing capture control bit field.', 'Table 13 bit field controlling camera timing shooting and upload/storage behavior.', 'dword', 'bitmask', '0', NULL, '0', 'Media', 'Controls periodic evidence capture from camera channels.', FALSE, FALSE),
    (101, '0x0065', 'Distance shooting control', 'Camera distance capture control bit field.', 'Table 14 bit field controlling camera capture by distance and upload/storage behavior.', 'dword', 'bitmask', '0', NULL, '0', 'Media', 'Controls distance-based evidence capture from camera channels.', FALSE, FALSE),
    (112, '0x0070', 'Image/video quality', 'Image/video quality setting.', 'Quality range is 1-10, where 1 is best according to the protocol.', 'dword', 'level', '1', '10', '8', 'Media', 'Impacts media quality and bandwidth/storage use.', FALSE, FALSE),
    (113, '0x0071', 'Brightness', 'Camera brightness.', 'Camera brightness, range 0-255.', 'dword', 'level', '0', '255', '127', 'Media', 'Affects camera image appearance.', FALSE, FALSE),
    (114, '0x0072', 'Contrast', 'Camera contrast.', 'Camera contrast, range 0-127.', 'dword', 'level', '0', '127', '64', 'Media', 'Affects camera image appearance.', FALSE, FALSE),
    (115, '0x0073', 'Saturation', 'Camera saturation.', 'Camera saturation, range 0-127.', 'dword', 'level', '0', '127', '64', 'Media', 'Affects camera image appearance.', FALSE, FALSE),
    (116, '0x0074', 'Chromaticity', 'Camera chromaticity.', 'Camera chromaticity, range 0-255.', 'dword', 'level', '0', '255', '128', 'Media', 'Affects camera image appearance.', FALSE, FALSE),
    (128, '0x0080', 'Vehicle odometer', 'Vehicle odometer reading.', 'Odometer value in 1/10 km.', 'dword', '0.1 km', '0', NULL, '0', 'Vehicle', 'Provides base odometer value for trip/accounting workflows.', FALSE, FALSE),
    (131, '0x0083', 'Vehicle registration number', 'Official vehicle registration number.', 'Registration number issued by public security traffic management department.', 'string', NULL, NULL, NULL, '', 'Vehicle', 'Used to align terminal identity with official vehicle identity.', FALSE, FALSE),
    (132, '0x0084', 'License plate color', 'JT/T415-2006 license plate color.', 'License plate color code according to JT/T415-2006.', 'byte', NULL, '0', '255', '2', 'Vehicle', 'Affects vehicle registration identity.', FALSE, FALSE),
    (144, '0x0090', 'GNSS positioning mode', 'GNSS constellation enable bit field.', 'Bits enable GPS, Beidou, GLONASS, and Galileo positioning.', 'byte', 'bitmask', '0', '15', '1', 'GNSS', 'Controls which positioning systems the terminal uses.', FALSE, FALSE),
    (145, '0x0091', 'GNSS baud rate', 'GNSS module baud rate.', '0=4800, 1=9600, 2=19200, 3=38400, 4=57600, 5=115200.', 'byte', NULL, '0', '5', '1', 'GNSS', 'Incorrect baud rate can break GNSS module communication.', FALSE, TRUE),
    (147, '0x0093', 'GNSS collect frequency', 'GNSS detailed data collect frequency.', 'Collect frequency for GNSS detailed location data. Default is 1 second.', 'dword', 'seconds', '1', NULL, '1', 'GNSS', 'Controls high-detail GNSS sampling density.', FALSE, FALSE),
    (256, '0x0100', 'CAN1 collect interval', 'CAN bus channel 1 collect interval.', 'CAN channel 1 collection interval in milliseconds. 0 disables collection.', 'dword', 'ms', '0', NULL, '0', 'CAN', 'Controls CAN data collection load.', FALSE, FALSE),
    (257, '0x0101', 'CAN1 upload interval', 'CAN bus channel 1 upload interval.', 'CAN channel 1 upload interval in seconds. 0 disables upload.', 'word', 'seconds', '0', NULL, '0', 'CAN', 'Controls CAN data upload frequency.', FALSE, FALSE),
    (258, '0x0102', 'CAN2 collect interval', 'CAN bus channel 2 collect interval.', 'CAN channel 2 collection interval in milliseconds. 0 disables collection.', 'dword', 'ms', '0', NULL, '0', 'CAN', 'Controls CAN data collection load.', FALSE, FALSE),
    (259, '0x0103', 'CAN2 upload interval', 'CAN bus channel 2 upload interval.', 'CAN channel 2 upload interval in seconds. 0 disables upload.', 'word', 'seconds', '0', NULL, '0', 'CAN', 'Controls CAN data upload frequency.', FALSE, FALSE),
    (272, '0x0110', 'CAN ID collection setting', 'Separate collection setting for CAN bus ID.', 'Eight-byte setting: collect interval, channel, frame type, collection mode, and CAN ID.', 'bytes8', NULL, NULL, NULL, '0000000000000000', 'CAN', 'Defines per-CAN-ID collection behavior.', FALSE, FALSE)
ON CONFLICT DO NOTHING;

INSERT INTO garuda_registry.terminal_parameter_profile
    (profile_id, org_id, device_id, profile_scope, profile_name, description, profile_status)
VALUES
    ('profile-camera-host', 'org-jamshedpur', NULL, 'org', 'Camera host defaults',
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
