package io.eregion.common;

import java.util.LinkedHashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * One error shape for the whole API: RFC 9457 problem details. Extending {@link ResponseEntityExceptionHandler}
 * gives Spring's own errors (unreadable JSON, a wrong type in the path, unknown route, wrong method or media type)
 * the same shape as ours, and the last handler keeps an unexpected failure from leaking anything but a status.
 */
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

	@ExceptionHandler(TooManyRequestsException.class)
	public ResponseEntity<ProblemDetail> handleTooMany(TooManyRequestsException ex) {
		return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
				.header(HttpHeaders.RETRY_AFTER, String.valueOf(ex.retryAfterSeconds()))
				.body(ProblemDetail.forStatusAndDetail(HttpStatus.TOO_MANY_REQUESTS, ex.getMessage()));
	}

	@ExceptionHandler(ApiException.class)
	public ProblemDetail handleApi(ApiException ex) {
		return ProblemDetail.forStatusAndDetail(ex.status(), ex.getMessage());
	}

	@Override
	protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex, HttpHeaders headers,
			HttpStatusCode status, WebRequest request) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Some fields need another look.");
		Map<String, String> fields = new LinkedHashMap<>();
		ex.getBindingResult().getFieldErrors()
				.forEach(error -> fields.putIfAbsent(error.getField(), error.getDefaultMessage()));
		problem.setProperty("fields", fields);
		return ResponseEntity.badRequest().body(problem);
	}

	/**
	 * Postgres refuses text holding a NUL character, and a request can carry one in any field or search. That is
	 * the caller's mistake, not a server failure. Any other integrity failure that reached here is a conflict
	 * with data already stored.
	 */
	@ExceptionHandler(DataIntegrityViolationException.class)
	public ProblemDetail handleIntegrity(DataIntegrityViolationException ex) {
		String message = String.valueOf(ex.getMostSpecificCause().getMessage());
		if (message.contains("0x00")) {
			return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Text cannot contain a null character.");
		}
		log.warn("Integrity violation reached the API boundary: {}", message);
		return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "That clashes with something already saved. Reload and try again.");
	}

	@ExceptionHandler(Exception.class)
	public ProblemDetail handleUnexpected(Exception ex) {
		log.error("Unhandled error", ex);
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "Something went wrong on our side. Try again in a moment.");
		// The id that finds this failure in the log, for a player who writes in about it.
		problem.setProperty("requestId", RequestIdFilter.current());
		return problem;
	}
}
