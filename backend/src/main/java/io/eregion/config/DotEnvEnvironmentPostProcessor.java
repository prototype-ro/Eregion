package io.eregion.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.boot.EnvironmentPostProcessor;
import org.springframework.boot.SpringApplication;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

public class DotEnvEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {

	@Override
	public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
		Path file = resolveEnvFile();
		if (file == null || !Files.isRegularFile(file)) {
			return;
		}
		Map<String, Object> values = new LinkedHashMap<>();
		try {
			for (String line : Files.readAllLines(file)) {
				String trimmed = line.strip();
				if (trimmed.isEmpty() || trimmed.startsWith("#")) {
					continue;
				}
				int eq = trimmed.indexOf('=');
				if (eq <= 0) {
					continue;
				}
				String key = trimmed.substring(0, eq).strip();
				String value = unquote(trimmed.substring(eq + 1).strip());
				values.put(key, value);
			}
		} catch (IOException ex) {
			return;
		}
		if (!values.isEmpty()) {
			environment.getPropertySources().addLast(new MapPropertySource("dotenv", values));
		}
	}

	private static Path resolveEnvFile() {
		Path cwd = Path.of("").toAbsolutePath().normalize();
		Path here = cwd.resolve(".env");
		if (Files.isRegularFile(here)) {
			return here;
		}
		Path parent = cwd.getParent();
		if (parent != null) {
			Path up = parent.resolve(".env");
			if (Files.isRegularFile(up)) {
				return up;
			}
		}
		return null;
	}

	private static String unquote(String value) {
		if (value.length() >= 2) {
			char first = value.charAt(0);
			char last = value.charAt(value.length() - 1);
			if ((first == '"' && last == '"') || (first == '\'' && last == '\'')) {
				return value.substring(1, value.length() - 1);
			}
		}
		return value;
	}

	@Override
	public int getOrder() {
		return Ordered.LOWEST_PRECEDENCE;
	}
}
