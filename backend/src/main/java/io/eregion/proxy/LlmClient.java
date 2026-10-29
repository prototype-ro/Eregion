package io.eregion.proxy;

/** A language model that answers one system and user message with text. Swappable, so tests and other providers fit. */
public interface LlmClient {

	/** The model's reply text. Throws {@code ApiException} when the service is not set up or fails. */
	String complete(String system, String user);

	/** The name stored with each generation. */
	String modelName();
}
