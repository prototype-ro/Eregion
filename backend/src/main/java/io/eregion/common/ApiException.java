package io.eregion.common;

import org.springframework.http.HttpStatus;

/** A failure that maps cleanly to an HTTP status and a message the client can show. */
public class ApiException extends RuntimeException {

	private final HttpStatus status;

	public ApiException(HttpStatus status, String message) {
		super(message);
		this.status = status;
	}

	public HttpStatus status() {
		return status;
	}

	public static ApiException notFound(String what) {
		return new ApiException(HttpStatus.NOT_FOUND, what + " not found");
	}

	public static ApiException badRequest(String message) {
		return new ApiException(HttpStatus.BAD_REQUEST, message);
	}

	/** For when something we depend on, such as Scryfall, is busy or down. The client can try again later. */
	public static ApiException unavailable(String message) {
		return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, message);
	}

	public static ApiException conflict(String message) {
		return new ApiException(HttpStatus.CONFLICT, message);
	}

	public static ApiException forbidden(String message) {
		return new ApiException(HttpStatus.FORBIDDEN, message);
	}

	public static ApiException unauthorized(String message) {
		return new ApiException(HttpStatus.UNAUTHORIZED, message);
	}
}
