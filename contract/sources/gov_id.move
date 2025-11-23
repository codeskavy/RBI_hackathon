module contract::gov_id {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::clock::{Self, Clock};
    use std::string::{Self, String};
    use std::vector;

    public struct GovIdProfile has key, store {
        id: UID,
        authority: address,
        id_hash: String,
        storage_hash: String,
        is_verified: bool,
        created_at: u64,
        updated_at: u64,
        is_active: bool,
    }

    const E_NOT_AUTHORIZED: u64 = 0;
    const E_INVALID_STRING_LENGTH: u64 = 1;
    const E_INVALID_CID_FORMAT: u64 = 2;

    fun validate_string(data: &String, max_len: u64) {
        let len = string::length(data);
        assert!(len > 0 && len <= max_len, E_INVALID_STRING_LENGTH);
    }

    fun validate_ipfs_cid(cid: &String) {
        validate_string(cid, 100);
        let bytes = string::bytes(cid);
        let prefix = b"bafy";
        let len = vector::length(bytes);
        assert!(len >= 46 && len <= 100, E_INVALID_CID_FORMAT);
        let mut i = 0;
        while (i < 4) {
            assert!(*vector::borrow(bytes, i) == *vector::borrow(&prefix, i), E_INVALID_CID_FORMAT);
            i = i + 1;
        };
    }

    public entry fun create_gov_id_profile(
        id_hash: vector<u8>,
        storage_hash: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let id_hash_str = string::utf8(id_hash);
        let storage_hash_str = string::utf8(storage_hash);
        validate_string(&id_hash_str, 100);
        validate_ipfs_cid(&storage_hash_str);

        let sender = tx_context::sender(ctx);
        let timestamp = clock::timestamp_ms(clock);
        let gov_id_profile = GovIdProfile {
            id: object::new(ctx),
            authority: sender,
            id_hash: id_hash_str,
            storage_hash: storage_hash_str,
            is_verified: false,
            created_at: timestamp,
            updated_at: timestamp,
            is_active: true,
        };
        transfer::transfer(gov_id_profile, sender);
    }

    public entry fun update_storage_hash(
        gov_id_profile: &mut GovIdProfile,
        new_storage_hash: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(gov_id_profile.authority == sender, E_NOT_AUTHORIZED);
        let storage_hash_str = string::utf8(new_storage_hash);
        validate_ipfs_cid(&storage_hash_str);

        gov_id_profile.storage_hash = storage_hash_str;
        gov_id_profile.updated_at = clock::timestamp_ms(clock);
    }

    public entry fun verify_gov_id(
        gov_id_profile: &mut GovIdProfile,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(gov_id_profile.authority == sender, E_NOT_AUTHORIZED);

        gov_id_profile.is_verified = true;
        gov_id_profile.updated_at = clock::timestamp_ms(clock);
    }

    public entry fun deactivate_gov_id_profile(
        gov_id_profile: &mut GovIdProfile,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(gov_id_profile.authority == sender, E_NOT_AUTHORIZED);

        gov_id_profile.is_active = false;
        gov_id_profile.updated_at = clock::timestamp_ms(clock);
    }

    public entry fun delete_gov_id_profile(
        gov_id_profile: GovIdProfile,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(gov_id_profile.authority == sender, E_NOT_AUTHORIZED);

        let GovIdProfile { id, authority: _, id_hash: _, storage_hash: _, is_verified: _, created_at: _, updated_at: _, is_active: _ } = gov_id_profile;
        object::delete(id);
    }

    public fun get_authority(gov_id_profile: &GovIdProfile): address {
        gov_id_profile.authority
    }

    public fun get_id_hash(gov_id_profile: &GovIdProfile): String {
        gov_id_profile.id_hash
    }

    public fun get_storage_hash(gov_id_profile: &GovIdProfile): String {
        gov_id_profile.storage_hash
    }

    public fun is_verified(gov_id_profile: &GovIdProfile): bool {
        gov_id_profile.is_verified
    }

    public fun get_created_at(gov_id_profile: &GovIdProfile): u64 {
        gov_id_profile.created_at
    }

    public fun get_updated_at(gov_id_profile: &GovIdProfile): u64 {
        gov_id_profile.updated_at
    }

    public fun is_active(gov_id_profile: &GovIdProfile): bool {
        gov_id_profile.is_active
    }
}