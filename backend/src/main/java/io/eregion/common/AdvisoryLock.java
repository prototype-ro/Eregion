package io.eregion.common;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

import javax.sql.DataSource;

import org.springframework.stereotype.Component;

/**
 * A lock shared by every copy of the app that uses the same database, for work that must not run twice at once, such as a job on a
 * schedule that every server has. It is a Postgres advisory lock held on one connection for as long as the work runs.
 */
@Component
public class AdvisoryLock {

	private final DataSource dataSource;

	public AdvisoryLock(DataSource dataSource) {
		this.dataSource = dataSource;
	}

	/** Runs the work if nobody else holds this lock, and returns true. Returns false, doing nothing, when another server has it. */
	public boolean runIfFree(long key, Runnable work) {
		try (Connection connection = dataSource.getConnection()) {
			if (!tryLock(connection, key)) {
				return false;
			}
			try {
				work.run();
				return true;
			}
			finally {
				unlock(connection, key);
			}
		}
		catch (SQLException ex) {
			throw new IllegalStateException("Could not take the lock " + key, ex);
		}
	}

	private static boolean tryLock(Connection connection, long key) throws SQLException {
		try (PreparedStatement statement = connection.prepareStatement("SELECT pg_try_advisory_lock(?)")) {
			statement.setLong(1, key);
			try (ResultSet rs = statement.executeQuery()) {
				return rs.next() && rs.getBoolean(1);
			}
		}
	}

	private static void unlock(Connection connection, long key) {
		try (PreparedStatement statement = connection.prepareStatement("SELECT pg_advisory_unlock(?)")) {
			statement.setLong(1, key);
			statement.execute();
		}
		catch (SQLException ex) {
			// The lock goes when the connection's session ends, so a failed unlock only holds it until then.
		}
	}
}
