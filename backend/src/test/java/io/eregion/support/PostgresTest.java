package io.eregion.support;

import javax.sql.DataSource;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * A real Postgres, migrated by Flyway, for tests that have to exercise SQL. The database is shared
 * by every test in a class, so tests must not assume an empty schema. Skipped when Docker is not
 * available, which keeps a plain {@code mvn test} working on a laptop without it.
 */
@Testcontainers(disabledWithoutDocker = true)
public abstract class PostgresTest {

	@Container
	protected static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17-alpine")
			.withDatabaseName("eregion");

	protected static JdbcClient jdbc;

	protected static DataSource dataSource;

	@BeforeAll
	static void migrateDatabase() {
		dataSource = new DriverManagerDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(),
				POSTGRES.getPassword());
		Flyway.configure().dataSource(dataSource).load().migrate();
		jdbc = JdbcClient.create(dataSource);
	}
}
