package io.eregion.auth;

import java.util.UUID;

public record User(UUID id, String email, String passwordHash, String displayName) {
}
