package io.eregion.custom;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;

import io.eregion.common.AdvisoryLock;
import io.eregion.support.PostgresTest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;

/** Art in a bucket (S3Mock standing in for S3 or R2): new uploads, the move of old art, and removal of deleted art. */
class ArtStorageTest extends PostgresTest {

	@SuppressWarnings("resource")
	private static final GenericContainer<?> S3 = new GenericContainer<>("adobe/s3mock:4.7.0")
			.withEnv("COM_ADOBE_TESTING_S3MOCK_STORE_INITIAL_BUCKETS", "eregion-art")
			.withExposedPorts(9090)
			.waitingFor(Wait.forHttp("/").forPort(9090));
	private static S3ArtStore bucket;

	@BeforeAll
	static void startBucket() {
		S3.start();
		String endpoint = "http://" + S3.getHost() + ":" + S3.getMappedPort(9090);
		bucket = new S3ArtStore(endpoint, "us-east-1", "eregion-art", "test-key", "test-secret", true);
	}

	@AfterAll
	static void stopBucket() {
		S3.stop();
	}

	private static UUID user(String email) {
		return jdbc.sql("INSERT INTO users (email, password_hash, display_name) VALUES (:e, 'x', :e) RETURNING id").param("e", email).query(UUID.class).single();
	}

	private static UUID card(String name) {
		return jdbc.sql("INSERT INTO cards (scryfall_id, name, type_line, primary_type) VALUES (gen_random_uuid(), :n, 'Creature', 'Creature') RETURNING id")
				.param("n", name).query(UUID.class).single();
	}

	@Test
	void newArtGoesToTheBucketAndIsServedFromIt() {
		ArtStorage storage = new ArtStorage(jdbc, new AdvisoryLock(dataSource), bucket);
		CustomPrintingRepository repository = new CustomPrintingRepository(jdbc);
		UUID owner = user("bucket-new@example.com");
		byte[] image = { 1, 2, 3, 4, 5 };

		UUID id = repository.insert(owner, card("Bucket New Card"), "art", "image/png", image, false);
		storage.putInBucket(id, image, "image/png");

		assertThat(jdbc.sql("SELECT data IS NULL FROM custom_printings WHERE id = :id").param("id", id).query(Boolean.class).single()).isTrue();
		CustomPrintingRepository.Image found = repository.imageFor(id, owner).orElseThrow();
		assertThat(found.storedIn()).isEqualTo("s3");
		assertThat(storage.read(found.id(), found.storedIn(), found.data())).containsExactly(image);
	}

	@Test
	void movesOldArtOutOfTheDatabaseAndRemovesDeletedArt() {
		ArtStorage storage = new ArtStorage(jdbc, new AdvisoryLock(dataSource), bucket);
		CustomPrintingRepository repository = new CustomPrintingRepository(jdbc);
		UUID owner = user("bucket-move@example.com");
		byte[] image = { 9, 8, 7 };
		UUID id = repository.insert(owner, card("Bucket Move Card"), "old", "image/png", image, true);

		while (storage.moveBatch() > 0) {
			// Earlier tests may have left database rows too; move them all.
		}
		CustomPrintingRepository.Image moved = repository.imageFor(id, owner).orElseThrow();
		assertThat(moved.storedIn()).isEqualTo("s3");
		assertThat(moved.data()).isNull();
		assertThat(bucket.get(id)).containsExactly(image);

		// Deleting the row (here directly, as a cascade would) leaves a note, and the job removes the object.
		jdbc.sql("DELETE FROM custom_printings WHERE id = :id").param("id", id).update();
		assertThat(storage.collectGarbage()).isPositive();
		assertThatThrownBy(() -> bucket.get(id)).isInstanceOf(NoSuchKeyException.class);
	}
}
