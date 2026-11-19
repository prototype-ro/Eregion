package io.eregion.proxy;

import java.util.List;

import io.eregion.common.ApiException;

/** A language model that answers one system and user message with text. Swappable, so tests and other providers fit. */
public interface LlmClient {

	/** The model's reply text. Throws {@code ApiException} when the service is not set up or fails. */
	String complete(String system, String user);

	/** One message of a free-form chat, role "user" or "assistant". */
	record Turn(String role, String content) {
	}

	/**
	 * A free-form, multi-turn reply (not constrained to JSON), for discussing a direction before it is committed.
	 * Default implementation refuses, so providers that do not support chat yet fail loudly instead of silently.
	 */
	default String chat(String system, List<Turn> turns) {
		throw ApiException.unavailable("Chat is not supported by this model provider.");
	}

	/** The name stored with each generation. */
	String modelName();
}
