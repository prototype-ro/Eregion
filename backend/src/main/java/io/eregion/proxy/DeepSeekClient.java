package io.eregion.proxy;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Map;

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

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private final RestClient http;
	private final String apiKey;
	private final String model;

	public DeepSeekClient(@Value("${eregion.llm.api-key:}") String apiKey, @Value("${eregion.llm.url}") String url,
			@Value("${eregion.llm.model}") String model) {
		this.apiKey = apiKey;
		this.model = model;
		var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());
		factory.setReadTimeout(Duration.ofSeconds(90));
		this.http = RestClient.builder().baseUrl(url).requestFactory(factory).build();
	}

	@Override
	public String complete(String system, String user) {
		if (apiKey == null || apiKey.isBlank()) {
			throw ApiException.unavailable("Proxy generation is not set up. Set EREGION_LLM_API_KEY on the server.");
		}
		Map<String, Object> body = Map.of(
				"model", model,
				"temperature", 0.8,
				"response_format", Map.of("type", "json_object"),
				"messages", List.of(Map.of("role", "system", "content", system), Map.of("role", "user", "content", user)));
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
			throw ApiException.unavailable("The model service could not be reached. Try again in a moment.");
		}
	}

	@Override
	public String modelName() {
		return model;
	}
}
