package io.eregion.auth;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class UserRepository {

	private static final String COLUMNS = "id, email, password_hash, display_name, email_verified, token_version";

	private final JdbcClient jdbc;

	public UserRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	public Optional<User> findByEmail(String email) {
		return jdbc.sql("SELECT " + COLUMNS + " FROM users WHERE lower(email) = lower(:email)")
				.param("email", email)
				.query(UserRepository::map)
				.optional();
	}

	public Optional<User> findById(UUID id) {
		return jdbc.sql("SELECT " + COLUMNS + " FROM users WHERE id = :id")
				.param("id", id)
				.query(UserRepository::map)
				.optional();
	}

	public User insert(String email, String passwordHash, String displayName) {
		return jdbc.sql("INSERT INTO users (email, password_hash, display_name) VALUES (:email, :hash, :name) RETURNING " + COLUMNS)
				.param("email", email)
				.param("hash", passwordHash)
				.param("name", displayName)
				.query(UserRepository::map)
				.single();
	}

	/** The version a valid session must carry. Empty when the account no longer exists. */
	public Optional<Integer> tokenVersion(UUID id) {
		return jdbc.sql("SELECT token_version FROM users WHERE id = :id").param("id", id).query(Integer.class).optional();
	}

	/** Sets a new password and ends every open session by moving the token version on. Returns the new version. */
	public int changePassword(UUID id, String passwordHash) {
		return jdbc.sql("UPDATE users SET password_hash = :hash, token_version = token_version + 1 WHERE id = :id RETURNING token_version")
				.param("id", id)
				.param("hash", passwordHash)
				.query(Integer.class)
				.single();
	}

	public int endAllSessions(UUID id) {
		return jdbc.sql("UPDATE users SET token_version = token_version + 1 WHERE id = :id RETURNING token_version")
				.param("id", id)
				.query(Integer.class)
				.single();
	}

	public void markVerified(UUID id) {
		jdbc.sql("UPDATE users SET email_verified = TRUE WHERE id = :id").param("id", id).update();
	}

	public void delete(UUID id) {
		jdbc.sql("DELETE FROM users WHERE id = :id").param("id", id).update();
	}

	private static User map(ResultSet rs, int rowNum) throws SQLException {
		return new User(rs.getObject("id", UUID.class), rs.getString("email"), rs.getString("password_hash"),
				rs.getString("display_name"), rs.getBoolean("email_verified"), rs.getInt("token_version"));
	}
}
