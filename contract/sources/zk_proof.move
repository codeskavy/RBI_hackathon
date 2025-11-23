/// ZK Login Module for Sui Blockchain
/// Handles user authentication with DigiLocker integration and KYC verification
module zk_login::kyc_auth {
    use sui::object::{Self, UID, ID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::event;
    use sui::table::{Self, Table};
    use sui::clock::{Self, Clock};
    use std::string::{Self, String};
    use std::vector;

    // ============== Error Codes ==============
    const EInvalidProof: u64 = 1;
    const EUserAlreadyExists: u64 = 2;
    const EUserNotFound: u64 = 3;
    const EKYCNotVerified: u64 = 4;
    const EInvalidDigiLockerData: u64 = 5;
    const ESessionExpired: u64 = 6;
    const EUnauthorized: u64 = 7;
    const EInvalidImageHash: u64 = 8;
    const EKYCAlreadyCompleted: u64 = 9;

    // ============== Constants ==============
    const SESSION_VALIDITY_MS: u64 = 86400000; // 24 hours in milliseconds
    const KYC_EXPIRY_MS: u64 = 31536000000;    // 1 year in milliseconds

    // ============== Structs ==============

    /// Admin capability for managing the KYC system
    public struct AdminCap has key, store {
        id: UID
    }

    /// Main registry storing all user KYC data
    public struct KYCRegistry has key {
        id: UID,
        users: Table<address, UserIdentity>,
        zk_proofs: Table<vector<u8>, address>,
        total_users: u64,
        verified_users: u64
    }

    /// User identity containing DigiLocker and KYC details
    public struct UserIdentity has store, copy, drop {
        user_address: address,
        digilocker_id: String,
        aadhaar_hash: vector<u8>,
        pan_hash: vector<u8>,
        name_hash: vector<u8>,
        dob_hash: vector<u8>,
        live_photo_hash: vector<u8>,
        zk_identity_commitment: vector<u8>,
        kyc_status: u8,
        kyc_timestamp: u64,
        kyc_expiry: u64,
        verification_level: u8
    }

    /// ZK Login credential issued to verified users
    public struct ZKLoginCredential has key, store {
        id: UID,
        user_address: address,
        identity_commitment: vector<u8>,
        nullifier_hash: vector<u8>,
        issued_at: u64,
        expires_at: u64,
        is_active: bool
    }

    /// Active session for authenticated users
    public struct UserSession has key, store {
        id: UID,
        user_address: address,
        session_token_hash: vector<u8>,
        created_at: u64,
        expires_at: u64,
        last_activity: u64
    }

    /// Verifier configuration for ZK proofs
    public struct ZKVerifierConfig has key {
        id: UID,
        verification_key: vector<u8>,
        allowed_issuers: vector<String>,
        min_verification_level: u8
    }

    // ============== Events ==============

    public struct UserRegistered has copy, drop {
        user_address: address,
        digilocker_id: String,
        timestamp: u64
    }

    public struct KYCCompleted has copy, drop {
        user_address: address,
        verification_level: u8,
        timestamp: u64
    }

    public struct ZKLoginSuccess has copy, drop {
        user_address: address,
        session_id: ID,
        timestamp: u64
    }

    public struct KYCRevoked has copy, drop {
        user_address: address,
        reason: String,
        timestamp: u64
    }

    // ============== Initialization ==============

    /// Initialise the KYC system
    fun init(ctx: &mut TxContext) {
        let admin_cap = AdminCap {
            id: object::new(ctx)
        };

        let registry = KYCRegistry {
            id: object::new(ctx),
            users: table::new(ctx),
            zk_proofs: table::new(ctx),
            total_users: 0,
            verified_users: 0
        };

        let verifier_config = ZKVerifierConfig {
            id: object::new(ctx),
            verification_key: vector::empty(),
            allowed_issuers: vector::empty(),
            min_verification_level: 1
        };

        transfer::transfer(admin_cap, tx_context::sender(ctx));
        transfer::share_object(registry);
        transfer::share_object(verifier_config);
    }

    // ============== User Registration ==============

    /// Register a new user with DigiLocker details
    public entry fun register_user(
        registry: &mut KYCRegistry,
        digilocker_id: vector<u8>,
        aadhaar_hash: vector<u8>,
        pan_hash: vector<u8>,
        name_hash: vector<u8>,
        dob_hash: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
       
        // Ensure user doesn't already exist
        assert!(!table::contains(&registry.users, sender), EUserAlreadyExists);
       
        // Validate DigiLocker data
        assert!(vector::length(&digilocker_id) > 0, EInvalidDigiLockerData);
        assert!(vector::length(&aadhaar_hash) == 32, EInvalidDigiLockerData);

        let current_time = clock::timestamp_ms(clock);

        let user_identity = UserIdentity {
            user_address: sender,
            digilocker_id: string::utf8(digilocker_id),
            aadhaar_hash,
            pan_hash,
            name_hash,
            dob_hash,
            live_photo_hash: vector::empty(),
            zk_identity_commitment: vector::empty(),
            kyc_status: 0, // Pending
            kyc_timestamp: 0,
            kyc_expiry: 0,
            verification_level: 0
        };

        table::add(&mut registry.users, sender, user_identity);
        registry.total_users = registry.total_users + 1;

        event::emit(UserRegistered {
            user_address: sender,
            digilocker_id: string::utf8(digilocker_id),
            timestamp: current_time
        });
    }

    // ============== KYC Verification ==============

    /// Submit live photo for KYC verification
    public entry fun submit_live_photo(
        registry: &mut KYCRegistry,
        live_photo_hash: vector<u8>,
        photo_metadata_hash: vector<u8>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
       
        assert!(table::contains(&registry.users, sender), EUserNotFound);
        assert!(vector::length(&live_photo_hash) == 32, EInvalidImageHash);

        let user = table::borrow_mut(&mut registry.users, sender);
       
        // Ensure KYC not already completed
        assert!(user.kyc_status != 2, EKYCAlreadyCompleted);

        user.live_photo_hash = live_photo_hash;
        user.kyc_status = 1; // Photo submitted, pending verification

        // Store metadata hash combined with photo hash for integrity
        let mut combined = live_photo_hash;
        vector::append(&mut combined, photo_metadata_hash);
        user.live_photo_hash = hash_data(combined);
    }

    /// Complete KYC verification (admin only)
    public entry fun complete_kyc_verification(
        _: &AdminCap,
        registry: &mut KYCRegistry,
        user_address: address,
        zk_identity_commitment: vector<u8>,
        verification_level: u8,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(table::contains(&registry.users, user_address), EUserNotFound);

        let current_time = clock::timestamp_ms(clock);
        let user = table::borrow_mut(&mut registry.users, user_address);

        // Ensure live photo was submitted
        assert!(vector::length(&user.live_photo_hash) > 0, EInvalidImageHash);

        user.zk_identity_commitment = zk_identity_commitment;
        user.kyc_status = 2; // Verified
        user.kyc_timestamp = current_time;
        user.kyc_expiry = current_time + KYC_EXPIRY_MS;
        user.verification_level = verification_level;

        // Store ZK proof mapping
        if (!table::contains(&registry.zk_proofs, zk_identity_commitment)) {
            table::add(&mut registry.zk_proofs, zk_identity_commitment, user_address);
        };

        registry.verified_users = registry.verified_users + 1;

        // Issue ZK Login Credential
        let credential = ZKLoginCredential {
            id: object::new(ctx),
            user_address,
            identity_commitment: zk_identity_commitment,
            nullifier_hash: generate_nullifier(zk_identity_commitment, current_time),
            issued_at: current_time,
            expires_at: current_time + KYC_EXPIRY_MS,
            is_active: true
        };

        transfer::transfer(credential, user_address);

        event::emit(KYCCompleted {
            user_address,
            verification_level,
            timestamp: current_time
        });
    }

    // ============== ZK Login ==============

    /// Perform ZK Login authentication
    public entry fun zk_login(
        registry: &KYCRegistry,
        verifier_config: &ZKVerifierConfig,
        credential: &ZKLoginCredential,
        zk_proof: vector<u8>,
        public_inputs: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let current_time = clock::timestamp_ms(clock);

        // Verify credential ownership
        assert!(credential.user_address == sender, EUnauthorized);
        assert!(credential.is_active, EUnauthorized);
        assert!(credential.expires_at > current_time, ESessionExpired);

        // Verify user exists and KYC is valid
        assert!(table::contains(&registry.users, sender), EUserNotFound);
        let user = table::borrow(&registry.users, sender);
        assert!(user.kyc_status == 2, EKYCNotVerified);
        assert!(user.kyc_expiry > current_time, ESessionExpired);
        assert!(user.verification_level >= verifier_config.min_verification_level, EKYCNotVerified);

        // Verify ZK proof
        assert!(
            verify_zk_proof(
                &verifier_config.verification_key,
                &zk_proof,
                &public_inputs,
                &credential.identity_commitment
            ),
            EInvalidProof
        );

        // Create session
        let session = UserSession {
            id: object::new(ctx),
            user_address: sender,
            session_token_hash: generate_session_token(sender, current_time),
            created_at: current_time,
            expires_at: current_time + SESSION_VALIDITY_MS,
            last_activity: current_time
        };

        let session_id = object::id(&session);

        event::emit(ZKLoginSuccess {
            user_address: sender,
            session_id,
            timestamp: current_time
        });

        transfer::transfer(session, sender);
    }

    /// Verify an active session
    public fun verify_session(
        session: &UserSession,
        clock: &Clock
    ): bool {
        let current_time = clock::timestamp_ms(clock);
        session.expires_at > current_time
    }

    /// Refresh session activity
    public entry fun refresh_session(
        session: &mut UserSession,
        clock: &Clock,
        ctx: &TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(session.user_address == sender, EUnauthorized);

        let current_time = clock::timestamp_ms(clock);
        assert!(session.expires_at > current_time, ESessionExpired);

        session.last_activity = current_time;
        session.expires_at = current_time + SESSION_VALIDITY_MS;
    }

    /// Logout and destroy session
    public entry fun logout(session: UserSession, ctx: &TxContext) {
        let sender = tx_context::sender(ctx);
        assert!(session.user_address == sender, EUnauthorized);
       
        let UserSession {
            id,
            user_address: _,
            session_token_hash: _,
            created_at: _,
            expires_at: _,
            last_activity: _
        } = session;
        object::delete(id);
    }

    // ============== Admin Functions ==============

    /// Revoke user KYC
    public entry fun revoke_kyc(
        _: &AdminCap,
        registry: &mut KYCRegistry,
        user_address: address,
        reason: vector<u8>,
        clock: &Clock
    ) {
        assert!(table::contains(&registry.users, user_address), EUserNotFound);

        let user = table::borrow_mut(&mut registry.users, user_address);
        user.kyc_status = 3; // Revoked

        if (registry.verified_users > 0) {
            registry.verified_users = registry.verified_users - 1;
        };

        event::emit(KYCRevoked {
            user_address,
            reason: string::utf8(reason),
            timestamp: clock::timestamp_ms(clock)
        });
    }

    /// Update verifier configuration
    public entry fun update_verifier_config(
        _: &AdminCap,
        config: &mut ZKVerifierConfig,
        new_verification_key: vector<u8>,
        min_level: u8
    ) {
        config.verification_key = new_verification_key;
        config.min_verification_level = min_level;
    }

    /// Add allowed issuer
    public entry fun add_allowed_issuer(
        _: &AdminCap,
        config: &mut ZKVerifierConfig,
        issuer: vector<u8>
    ) {
        vector::push_back(&mut config.allowed_issuers, string::utf8(issuer));
    }

    /// Deactivate a ZK Login credential
    public entry fun deactivate_credential(
        credential: &mut ZKLoginCredential,
        ctx: &TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(credential.user_address == sender, EUnauthorized);
        credential.is_active = false;
    }

    // ============== View Functions ==============

    /// Get user KYC status
    public fun get_kyc_status(registry: &KYCRegistry, user: address): u8 {
        if (!table::contains(&registry.users, user)) {
            return 0
        };
        table::borrow(&registry.users, user).kyc_status
    }

    /// Get user verification level
    public fun get_verification_level(registry: &KYCRegistry, user: address): u8 {
        if (!table::contains(&registry.users, user)) {
            return 0
        };
        table::borrow(&registry.users, user).verification_level
    }

    /// Check if user is verified
    public fun is_user_verified(
        registry: &KYCRegistry,
        user: address,
        clock: &Clock
    ): bool {
        if (!table::contains(&registry.users, user)) {
            return false
        };
        let user_data = table::borrow(&registry.users, user);
        user_data.kyc_status == 2 && user_data.kyc_expiry > clock::timestamp_ms(clock)
    }

    /// Get total registered users
    public fun get_total_users(registry: &KYCRegistry): u64 {
        registry.total_users
    }

    /// Get total verified users
    public fun get_verified_users(registry: &KYCRegistry): u64 {
        registry.verified_users
    }

    /// Check credential validity
    public fun is_credential_valid(
        credential: &ZKLoginCredential,
        clock: &Clock
    ): bool {
        credential.is_active && credential.expires_at > clock::timestamp_ms(clock)
    }

    // ============== Internal Helper Functions ==============

    /// Verify ZK proof (placeholder - implement actual verification logic)
    fun verify_zk_proof(
        _verification_key: &vector<u8>,
        _proof: &vector<u8>,
        _public_inputs: &vector<u8>,
        _commitment: &vector<u8>
    ): bool {
        // In production, implement actual ZK proof verification
        // using Groth16, PLONK, or other ZK proving systems
        // This would typically involve:
        // 1. Parsing the proof components
        // 2. Verifying the pairing equations
        // 3. Checking public inputs against commitment
        true
    }

    /// Generate nullifier hash
    fun generate_nullifier(commitment: vector<u8>, timestamp: u64): vector<u8> {
        let mut data = commitment;
        let ts_bytes = u64_to_bytes(timestamp);
        vector::append(&mut data, ts_bytes);
        hash_data(data)
    }

    /// Generate session token
    fun generate_session_token(user: address, timestamp: u64): vector<u8> {
        let mut data = address_to_bytes(user);
        let ts_bytes = u64_to_bytes(timestamp);
        vector::append(&mut data, ts_bytes);
        hash_data(data)
    }

    /// Simple hash function (placeholder)
    fun hash_data(data: vector<u8>): vector<u8> {
        // In production, use sui::hash::keccak256 or blake2b
        data
    }

    /// Convert u64 to bytes
    fun u64_to_bytes(value: u64): vector<u8> {
        let mut result = vector::empty<u8>();
        let mut v = value;
        let mut i = 0;
        while (i < 8) {
            vector::push_back(&mut result, ((v & 0xFF) as u8));
            v = v >> 8;
            i = i + 1;
        };
        result
    }

    /// Convert address to bytes
    fun address_to_bytes(addr: address): vector<u8> {
        sui::bcs::to_bytes(&addr)
    }

    // ============== Test Functions ==============
    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }
}