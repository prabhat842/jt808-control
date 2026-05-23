package com.example.control.api;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * UI-facing runtime configuration forwarded to the React app via GET /api/config.
 * All values are overrideable in application.yml (or env vars / -D flags).
 */
@Component
@ConfigurationProperties(prefix = "ui")
public class UiProperties {

    /** URL the browser uses to open RTVS (may differ from the internal proxy URL). */
    private String rtvsBrowserUrl = "http://localhost:8089";

    /** Default map centre — latitude (decimal degrees). */
    private double mapCenterLat = 22.8046;

    /** Default map centre — longitude (decimal degrees). */
    private double mapCenterLon = 86.2029;

    /** Default Mapbox zoom level. */
    private int mapZoom = 11;

    public String getRtvsBrowserUrl()               { return rtvsBrowserUrl; }
    public void   setRtvsBrowserUrl(String url)     { this.rtvsBrowserUrl = url; }

    public double getMapCenterLat()                 { return mapCenterLat; }
    public void   setMapCenterLat(double v)         { this.mapCenterLat = v; }

    public double getMapCenterLon()                 { return mapCenterLon; }
    public void   setMapCenterLon(double v)         { this.mapCenterLon = v; }

    public int  getMapZoom()                        { return mapZoom; }
    public void setMapZoom(int v)                   { this.mapZoom = v; }
}
