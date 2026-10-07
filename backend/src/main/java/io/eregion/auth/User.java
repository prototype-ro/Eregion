package io.eregion.auth;

import java.util.UUID;

/** emailVerified says whether the player proved they own the address. tokenVersion changes to end every open session. */
public record User(UUID id, String email, String passwordHash, String displayName, boolean emailVerified, int tokenVersion) {
}
