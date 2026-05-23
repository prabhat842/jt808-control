package com.example.control.api;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;

/**
 * Redirects legacy and convenience paths to the React SPA root.
 */
@RestController
public class RootController {

    @GetMapping(value = {"/ui", "/ui/", "/dashboard", "/dashboard/"})
    public ResponseEntity<Void> uiRedirect() {
        return ResponseEntity.status(302)
                .location(URI.create("/"))
                .build();
    }
}
