package io.eregion.auth;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class UserRepository {

	private final JdbcClient jdbc;

	public UserRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	public Optional<User> findByEmail(String email) {
		return jdbc.sql("SELECT id, email, password_hash, display_name FROM users WHERE lower(email) = lower(:email)")
				.param("email", email)
				.query(UserRepository::map)
				.optional();
	}

	public Optional<User> findById(UUID id) {
		return jdbc.sql("SELECT id, email, password_hash, display_name FROM users WHERE id = :id")
				.param("id", id)
				.query(UserRepository::map)
				.optional();
	}

	public User insert(String email, String passwordHash, String displayName) {
		return jdbc.sql("""
				INSERT INTO users (email, password_hash, display_name)
				VALUES (:email, :hash, :name)
				RETURNING id, email, password_hash, display_name
				""")
				.param("email", email)
				.param("hash", passwordHash)
				.param("name", displayName)
				.query(UserRepository::map)
				.single();
	}

	private static User map(ResultSet rs, int rowNum) throws SQLException {
		return new User(rs.getObject("id", UUID.class), rs.getString("email"), rs.getString("password_hash"),
				rs.getString("display_name"));
	}
}
