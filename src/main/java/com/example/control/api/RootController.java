package com.example.control.api;

import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

import java.net.URI;

/**
 * Redirects legacy and convenience paths to the React SPA root.
 */
@Controller
public class RootController {

    @GetMapping(value = {"/ui", "/ui/", "/dashboard", "/dashboard/"})
    public ResponseEntity<Void> uiRedirect() {
        return ResponseEntity.status(302)
                .location(URI.create("/"))
                .build();
    }

    @GetMapping(value = {"/vehicles", "/alarms", "/media", "/services", "/management"})
    public String spaRoute() {
        return "forward:/index.html";
    }
}
