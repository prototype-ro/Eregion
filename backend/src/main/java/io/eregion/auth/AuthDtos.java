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
			@NotBlank @Size(min = 10, max = 72, message = "must be 10 to 72 characters") String password,
			@NotBlank @Size(max = 60) String displayName) {
	}

	public record LoginRequest(@NotBlank String email, @NotBlank String password) {
	}

	public record UserDto(UUID id, String email, String displayName, boolean emailVerified) {
		static UserDto from(User user) {
			return new UserDto(user.id(), user.email(), user.displayName(), user.emailVerified());
		}
	}

	public record ForgotRequest(@NotBlank @Email @Size(max = 254) String email) {
	}

	public record ResetRequest(@NotBlank @Size(max = 200) String token, @NotBlank @Size(max = 72) String password) {
	}

	public record TokenRequest(@NotBlank @Size(max = 200) String token) {
	}

	public record ChangePasswordRequest(@NotBlank @Size(max = 72) String currentPassword, @NotBlank @Size(max = 72) String newPassword) {
	}

	public record DeleteAccountRequest(@NotBlank @Size(max = 72) String password) {
	}

	public record AuthResponse(String token, UserDto user) {
	}
}
