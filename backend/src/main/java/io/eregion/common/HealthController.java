package io.eregion.common;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** For load balancers and uptime checks. Answers 200 when the app can reach its database. */
@RestController
@RequestMapping("/api")
public class HealthController {

	private final JdbcClient jdbc;

	public HealthController(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@GetMapping("/health")
	public ResponseEntity<Map<String, String>> health() {
		try {
			jdbc.sql("SELECT 1").query(Integer.class).single();
			return ResponseEntity.ok(Map.of("status", "ok"));
		}
		catch (RuntimeException ex) {
			return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of("status", "down"));
		}
	}
}
