package io.eregion.custom;

import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import io.eregion.common.AdvisoryLock;

/**
 * Decides where uploaded art goes and reads it back. With EREGION_ART_STORE=s3 new art goes to the bucket, a job
 * moves the art already in the database there a batch at a time, and another removes bucket objects whose rows are
 * gone. Without it everything stays in the database, as before.
 */
@Service
public class ArtStorage {

	private static final long LOCK_KEY = 0x45726567_09L;
	private static final int MOVE_PER_RUN = 25;
	private static final Logger log = LoggerFactory.getLogger(ArtStorage.class);

	private final JdbcClient jdbc;
	private final ArtStore bucket;
	private final AdvisoryLock lock;

	@Autowired
	public ArtStorage(JdbcClient jdbc, AdvisoryLock lock, @Value("${eregion.art.store:database}") String store,
			@Value("${eregion.art.s3.endpoint:}") String endpoint, @Value("${eregion.art.s3.region:auto}") String region,
			@Value("${eregion.art.s3.bucket:}") String bucketName, @Value("${eregion.art.s3.access-key:}") String accessKey,
			@Value("${eregion.art.s3.secret-key:}") String secretKey, @Value("${eregion.art.s3.path-style:true}") boolean pathStyle) {
		this(jdbc, lock, "s3".equalsIgnoreCase(store) ? new S3ArtStore(endpoint, region, bucketName, accessKey, secretKey, pathStyle) : null);
		if ("s3".equalsIgnoreCase(store) && (bucketName.isBlank() || accessKey.isBlank() || secretKey.isBlank())) {
			throw new IllegalStateException("EREGION_ART_STORE=s3 needs EREGION_ART_S3_BUCKET, EREGION_ART_S3_ACCESS_KEY and EREGION_ART_S3_SECRET_KEY");
		}
	}

	/** bucket is null when art stays in the database. */
	ArtStorage(JdbcClient jdbc, AdvisoryLock lock, ArtStore bucket) {
		this.jdbc = jdbc;
		this.lock = lock;
		this.bucket = bucket;
	}

	public boolean usesBucket() {
		return bucket != null;
	}

	/** Stores the bytes of a new row, which must already exist with stored_in = 's3' and no data. */
	public void putInBucket(UUID id, byte[] data, String contentType) {
		bucket.put(id, data, contentType);
	}

	/** The bytes of an image, from wherever they are. */
	public byte[] read(UUID id, String storedIn, byte[] inRow) {
		if ("s3".equals(storedIn)) {
			if (bucket == null) {
				throw new IllegalStateException("Art " + id + " is in the bucket but no bucket is configured");
			}
			return bucket.get(id);
		}
		return inRow;
	}

	@Scheduled(initialDelayString = "${eregion.art.move-initial-delay-ms:120000}", fixedDelayString = "${eregion.art.move-every-ms:60000}")
	public void scheduled() {
		if (bucket == null) {
			return;
		}
		try {
			lock.runIfFree(LOCK_KEY, () -> {
				moveBatch();
				collectGarbage();
			});
		}
		catch (RuntimeException ex) {
			log.warn("Art storage job failed", ex);
		}
	}

	/** Moves up to a batch of images from the database into the bucket. Returns how many moved. */
	public int moveBatch() {
		List<UUID> ids = jdbc.sql("SELECT id FROM custom_printings WHERE stored_in = 'database' AND data IS NOT NULL ORDER BY created_at LIMIT :n")
				.param("n", MOVE_PER_RUN).query(UUID.class).list();
		int moved = 0;
		for (UUID id : ids) {
			var row = jdbc.sql("SELECT content_type, data FROM custom_printings WHERE id = :id AND stored_in = 'database'").param("id", id)
					.query((rs, n) -> new Object[] { rs.getString("content_type"), rs.getBytes("data") }).optional();
			if (row.isEmpty()) {
				continue;
			}
			bucket.put(id, (byte[]) row.get()[1], (String) row.get()[0]);
			moved += jdbc.sql("UPDATE custom_printings SET stored_in = 's3', data = NULL WHERE id = :id AND stored_in = 'database'").param("id", id).update();
		}
		if (moved > 0) {
			log.info("Moved {} images of custom art to the bucket", moved);
		}
		return moved;
	}

	/** Removes bucket objects whose rows were deleted. Returns how many. */
	public int collectGarbage() {
		List<UUID> ids = jdbc.sql("SELECT id FROM art_garbage ORDER BY deleted_at LIMIT 200").query(UUID.class).list();
		for (UUID id : ids) {
			bucket.delete(id);
			jdbc.sql("DELETE FROM art_garbage WHERE id = :id").param("id", id).update();
		}
		return ids.size();
	}
}
