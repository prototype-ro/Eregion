package io.eregion.proxy;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import io.eregion.common.ApiException;
import tools.jackson.databind.json.JsonMapper;

/** DeepSeek's OpenAI-style chat completions. The key comes from the environment and is never sent to the browser. */
@Component
public class DeepSeekClient implements LlmClient {

	private static final Logger log = LoggerFactory.getLogger(DeepSeekClient.class);
	private static final JsonMapper JSON = JsonMapper.builder().build();

	private final RestClient http;
	private final String apiKey;
	/** Used for free-form deliberation (the brainstorm pass) — slower but actually reasons instead of pattern-completing. */
	private final String reasoningModel;
	/** Used for the final JSON-locked generation — fast, reliable {@code response_format: json_object} support, and by the time this
	 * call runs the hard thinking already happened in the reasoning model's brainstorm pass, so speed matters more than depth here. */
	private final String jsonModel;

	public DeepSeekClient(@Value("${eregion.llm.api-key:}") String apiKey, @Value("${eregion.llm.url}") String url,
			@Value("${eregion.llm.model}") String reasoningModel, @Value("${eregion.llm.json-model}") String jsonModel) {
		this.apiKey = apiKey;
		this.reasoningModel = reasoningModel;
		this.jsonModel = jsonModel;
		var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());
		// deepseek-reasoner can genuinely take this long to think through a multi-page system prompt; the fast
		// json-model call below rarely needs more than a fraction of this.
		factory.setReadTimeout(Duration.ofSeconds(90));
		this.http = RestClient.builder().baseUrl(url).requestFactory(factory).build();
	}

	/** deepseek-reasoner ignores or rejects temperature/response_format/etc; only deepseek-chat and similar models want them. */
	private static boolean isReasoningModel(String model) {
		return model != null && model.contains("reasoner");
	}

	@Override
	public String complete(String system, String user) {
		var body = new java.util.HashMap<String, Object>();
		body.put("model", jsonModel);
		body.put("messages", List.of(Map.of("role", "system", "content", system), Map.of("role", "user", "content", user)));
		if (!isReasoningModel(jsonModel)) {
			// response_format forces strict JSON; deepseek-reasoner does not support it, so the prompt's own
			// "reply with one JSON object" instruction plus stripFence()'s tolerant parsing carry that model instead.
			body.put("temperature", 0.8);
			body.put("response_format", Map.of("type", "json_object"));
		}
		return call(body);
	}

	@Override
	public String chat(String system, List<Turn> turns) {
		var messages = new java.util.ArrayList<Map<String, Object>>();
		messages.add(Map.of("role", "system", "content", system));
		for (Turn turn : turns) {
			messages.add(Map.of("role", turn.role(), "content", turn.content()));
		}
		var body = new java.util.HashMap<String, Object>();
		body.put("model", reasoningModel);
		body.put("messages", messages);
		if (!isReasoningModel(reasoningModel)) {
			body.put("temperature", 0.8);
		}
		return call(body);
	}

	private String call(Map<String, Object> body) {
		if (apiKey == null || apiKey.isBlank()) {
			throw ApiException.unavailable("Proxy generation is not set up. Set EREGION_LLM_API_KEY on the server.");
		}
		try {
			String answer = http.post()
					.contentType(MediaType.APPLICATION_JSON)
					.header("Authorization", "Bearer " + apiKey)
					.body(body)
					.retrieve()
					.body(String.class);
			return JSON.readTree(answer).path("choices").path(0).path("message").path("content").asString("");
		}
		catch (RestClientResponseException ex) {
			int status = ex.getStatusCode().value();
			if (status == 401 || status == 403) {
				throw ApiException.unavailable("The model service refused the key. Check EREGION_LLM_API_KEY.");
			}
			if (status == 402) {
				throw ApiException.unavailable("The model service says the account has no balance.");
			}
			throw ApiException.unavailable("The model service answered " + status + ". Try again in a moment.");
		}
		catch (RuntimeException ex) {
			log.warn("Model service call failed: {}", ex.toString());
			throw ApiException.unavailable("The model service could not be reached. Try again in a moment.");
		}
	}

	@Override
	public String modelName() {
		return jsonModel;
	}
}
