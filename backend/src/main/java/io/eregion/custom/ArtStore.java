package io.eregion.custom;

import java.util.UUID;

/** Where the bytes of uploaded art live, when not in the database. */
public interface ArtStore {

	void put(UUID id, byte[] data, String contentType);

	byte[] get(UUID id);

	void delete(UUID id);
}
