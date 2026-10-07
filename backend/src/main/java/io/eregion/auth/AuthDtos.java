package io.eregion.auth;

import java.util.UUID;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class AuthDtos {

	private AuthDtos() {
	}

	public record RegisterRequest(
			@NotBlank @Email @Size(max = 254) String email,
			@NotBlank @Size(min = 8, max = 72, message = "must be 8 to 72 characters") String password,
			@NotBlank @Size(max = 60) String displayName) {
	}

	public record LoginRequest(@NotBlank String email, @NotBlank String password) {
	}

	public record UserDto(UUID id, String email, String displayName) {
		static UserDto from(User user) {
			return new UserDto(user.id(), user.email(), user.displayName());
		}
	}

	public record AuthResponse(String token, UserDto user) {
	}
}
