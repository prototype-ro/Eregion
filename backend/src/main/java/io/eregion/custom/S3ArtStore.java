package io.eregion.custom;

import java.net.URI;
import java.util.UUID;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;

/**
 * Art in an S3-compatible bucket: Amazon S3, Cloudflare R2, Backblaze B2 or MinIO, by endpoint. Objects are named
 * art/<id>. The bucket stays private; the API serves each image with the same access rules as before.
 */
public class S3ArtStore implements ArtStore {

	private final S3Client s3;
	private final String bucket;

	public S3ArtStore(String endpoint, String region, String bucket, String accessKey, String secretKey, boolean pathStyle) {
		var builder = S3Client.builder()
				.httpClient(UrlConnectionHttpClient.create())
				.region(Region.of(region == null || region.isBlank() ? "auto" : region))
				.credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey, secretKey)))
				.serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(pathStyle).build());
		if (endpoint != null && !endpoint.isBlank()) {
			builder.endpointOverride(URI.create(endpoint));
		}
		this.s3 = builder.build();
		this.bucket = bucket;
	}

	private static String key(UUID id) {
		return "art/" + id;
	}

	@Override
	public void put(UUID id, byte[] data, String contentType) {
		s3.putObject(request -> request.bucket(bucket).key(key(id)).contentType(contentType), RequestBody.fromBytes(data));
	}

	@Override
	public byte[] get(UUID id) {
		return s3.getObjectAsBytes(request -> request.bucket(bucket).key(key(id))).asByteArray();
	}

	@Override
	public void delete(UUID id) {
		s3.deleteObject(request -> request.bucket(bucket).key(key(id)));
	}
}
