package io.eregion.generate;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import io.eregion.auth.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping("/api")
public class GenerateController {

	public record PlaystyleDto(String id, String label, String description) {
	}

	public record GenerateRequest(
			@NotNull UUID commanderId,
			@Size(max = 2, message = "pick at most two playstyles") List<String> playstyles,
			@Min(1) @Max(1000) Integer maxPriceUsd,
			Boolean ownedOnly,
			@Size(max = 80) String name) {
	}

	private final DeckGenerator generator;

	public GenerateController(DeckGenerator generator) {
		this.generator = generator;
	}

	@GetMapping("/playstyles")
	public List<PlaystyleDto> playstyles() {
		return Playstyle.ALL.stream().map(style -> new PlaystyleDto(style.id(), style.label(), style.description())).toList();
	}

	/** Builds a first draft for a commander and saves it as a new deck. */
	@PostMapping("/decks/generate")
	@ResponseStatus(HttpStatus.CREATED)
	public DeckGenerator.Result generate(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody GenerateRequest request) {
		return generator.generate(CurrentUser.id(jwt),
				new DeckGenerator.Request(request.commanderId(), request.playstyles(), request.maxPriceUsd(), Boolean.TRUE.equals(request.ownedOnly()), request.name()));
	}
}
