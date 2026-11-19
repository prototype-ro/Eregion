package io.eregion.common;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Which optional parts of the app this server has turned on, so the site shows only what works. */
@RestController
@RequestMapping("/api")
public class FeaturesController {

	public record Features(boolean assistant) {
	}

	private final boolean assistant;

	public FeaturesController(@Value("${eregion.assistant.enabled:false}") boolean assistant) {
		this.assistant = assistant;
	}

	@GetMapping("/features")
	public Features features() {
		return new Features(assistant);
	}
}
