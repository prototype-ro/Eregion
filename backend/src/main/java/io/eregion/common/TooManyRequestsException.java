package io.eregion.common;

import org.springframework.http.HttpStatus;

/** A limit was used up. retryAfterSeconds goes out as the Retry-After header. */
public class TooManyRequestsException extends ApiException {

	private final long retryAfterSeconds;

	public TooManyRequestsException(String message, long retryAfterSeconds) {
		super(HttpStatus.TOO_MANY_REQUESTS, message);
		this.retryAfterSeconds = retryAfterSeconds;
	}

	public long retryAfterSeconds() {
		return retryAfterSeconds;
	}
}
