module contract::decentralized_back {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::clock::{Self, Clock};
    use std::string::{Self, String};
    use std::vector;

    public struct KycProfile has key, store {
        id: UID,
        authority: address,
        ipfs_hash: String,
        vc_hash: String,
        vc_verified: bool,
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

    public entry fun create_kyc_profile(
        ipfs_hash: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let ipfs_hash_str = string::utf8(ipfs_hash);
        validate_ipfs_cid(&ipfs_hash_str);

        let sender = tx_context::sender(ctx);
        let timestamp = clock::timestamp_ms(clock);
        let kyc_profile = KycProfile {
            id: object::new(ctx),
            authority: sender,
            ipfs_hash: ipfs_hash_str,
            vc_hash: string::utf8(b""),
            vc_verified: false,
            created_at: timestamp,
            updated_at: timestamp,
            is_active: true,
        };
        transfer::transfer(kyc_profile, sender);
    }

    public entry fun update_kyc_profile(
        kyc_profile: &mut KycProfile,
        new_ipfs_hash: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(kyc_profile.authority == sender, E_NOT_AUTHORIZED);
        let ipfs_hash_str = string::utf8(new_ipfs_hash);
        validate_ipfs_cid(&ipfs_hash_str);

        kyc_profile.ipfs_hash = ipfs_hash_str;
        kyc_profile.updated_at = clock::timestamp_ms(clock);
    }

    public entry fun verify_vc(
        kyc_profile: &mut KycProfile,
        vc_hash: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(kyc_profile.authority == sender, E_NOT_AUTHORIZED);
        let vc_hash_str = string::utf8(vc_hash);
        validate_string(&vc_hash_str, 100);

        kyc_profile.vc_hash = vc_hash_str;
        kyc_profile.vc_verified = true;
        kyc_profile.updated_at = clock::timestamp_ms(clock);
    }

    public entry fun deactivate_kyc_profile(
        kyc_profile: &mut KycProfile,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(kyc_profile.authority == sender, E_NOT_AUTHORIZED);

        kyc_profile.is_active = false;
        kyc_profile.updated_at = clock::timestamp_ms(clock);
    }

    public entry fun delete_kyc_profile(
        kyc_profile: KycProfile,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(kyc_profile.authority == sender, E_NOT_AUTHORIZED);

        let KycProfile { id, authority: _, ipfs_hash: _, vc_hash: _, vc_verified: _, created_at: _, updated_at: _, is_active: _ } = kyc_profile;
        object::delete(id);
    }

    public fun get_authority(kyc_profile: &KycProfile): address {
        kyc_profile.authority
    }

    public fun get_ipfs_hash(kyc_profile: &KycProfile): String {
        kyc_profile.ipfs_hash
    }

    public fun get_vc_hash(kyc_profile: &KycProfile): String {
        kyc_profile.vc_hash
    }

    public fun is_vc_verified(kyc_profile: &KycProfile): bool {
        kyc_profile.vc_verified
    }

    public fun get_created_at(kyc_profile: &KycProfile): u64 {
        kyc_profile.created_at
    }

    public fun get_updated_at(kyc_profile: &KycProfile): u64 {
        kyc_profile.updated_at
    }

    public fun is_active(kyc_profile: &KycProfile): bool {
        kyc_profile.is_active
    }
}