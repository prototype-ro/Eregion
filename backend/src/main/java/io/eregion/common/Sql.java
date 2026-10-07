package io.eregion.common;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;

public final class Sql {

	private Sql() {
	}

	/** Reads a nullable numeric column. The Postgres driver will not convert numeric to Double directly. */
	public static Double nullableDouble(ResultSet rs, String column) throws SQLException {
		BigDecimal value = rs.getBigDecimal(column);
		return value == null ? null : value.doubleValue();
	}
}
