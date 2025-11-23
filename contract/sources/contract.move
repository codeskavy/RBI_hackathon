module contract::contract {
    use std::string::{Self, String};
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::table::{Self, Table};
    use sui::event;

    /// Error codes
    const E_USER_NOT_FOUND: u64 = 0;
    const E_USER_ALREADY_EXISTS: u64 = 1;
    const E_INVALID_KYC_STATUS: u64 = 2;
    const E_UNAUTHORIZED: u64 = 3;

    /// KYC Status enum
    const KYC_PENDING: u8 = 0;
    const KYC_VERIFIED: u8 = 1;
    const KYC_REJECTED: u8 = 2;

    /// User data structure
    public struct UserData has key, store {
        id: UID,
        wallet_address: address,
        kyc_status: u8,
        category: String,
        cid_hash: String,
        created_at: u64,
        updated_at: u64,
    }

    /// Registry to store all user data
    public struct UserRegistry has key {
        id: UID,
        users: Table<address, UserData>,
        admin: address,
    }

    /// Admin capability for managing the registry
    public struct AdminCap has key {
        id: UID,
    }

    /// Events
    public struct UserRegistered has copy, drop {
        wallet_address: address,
        category: String,
        cid_hash: String,
    }

    public struct KYCStatusUpdated has copy, drop {
        wallet_address: address,
        old_status: u8,
        new_status: u8,
    }

    public struct UserDataUpdated has copy, drop {
        wallet_address: address,
        category: String,
        cid_hash: String,
    }

    /// Initialize the registry (called once during deployment)
    fun init(ctx: &mut TxContext) {
        let admin = tx_context::sender(ctx);
        
        let registry = UserRegistry {
            id: object::new(ctx),
            users: table::new(ctx),
            admin,
        };

        let admin_cap = AdminCap {
            id: object::new(ctx),
        };

        transfer::share_object(registry);
        transfer::transfer(admin_cap, admin);
    }

    /// Register a new user
    public entry fun register_user(
        registry: &mut UserRegistry,
        wallet_address: address,
        category: String,
        cid_hash: String,
        ctx: &mut TxContext
    ) {
        assert!(!table::contains(&registry.users, wallet_address), E_USER_ALREADY_EXISTS);

        let current_time = tx_context::epoch_timestamp_ms(ctx);
        
        let user_data = UserData {
            id: object::new(ctx),
            wallet_address,
            kyc_status: KYC_PENDING,
            category,
            cid_hash,
            created_at: current_time,
            updated_at: current_time,
        };

        table::add(&mut registry.users, wallet_address, user_data);

        event::emit(UserRegistered {
            wallet_address,
            category,
            cid_hash,
        });
    }

    /// Update KYC status (admin only)
    public entry fun update_kyc_status(
        registry: &mut UserRegistry,
        _admin_cap: &AdminCap,
        wallet_address: address,
        new_status: u8,
        ctx: &mut TxContext
    ) {
        assert!(table::contains(&registry.users, wallet_address), E_USER_NOT_FOUND);
        assert!(new_status <= KYC_REJECTED, E_INVALID_KYC_STATUS);

        let user_data = table::borrow_mut(&mut registry.users, wallet_address);
        let old_status = user_data.kyc_status;
        
        user_data.kyc_status = new_status;
        user_data.updated_at = tx_context::epoch_timestamp_ms(ctx);

        event::emit(KYCStatusUpdated {
            wallet_address,
            old_status,
            new_status,
        });
    }

    /// Update user data (category and CID hash)
    public entry fun update_user_data(
        registry: &mut UserRegistry,
        wallet_address: address,
        new_category: String,
        new_cid_hash: String,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(sender == wallet_address || sender == registry.admin, E_UNAUTHORIZED);
        assert!(table::contains(&registry.users, wallet_address), E_USER_NOT_FOUND);

        let user_data = table::borrow_mut(&mut registry.users, wallet_address);
        
        user_data.category = new_category;
        user_data.cid_hash = new_cid_hash;
        user_data.updated_at = tx_context::epoch_timestamp_ms(ctx);

        event::emit(UserDataUpdated {
            wallet_address,
            category: new_category,
            cid_hash: new_cid_hash,
        });
    }

    /// Get user data (read-only)
    public fun get_user_data(
        registry: &UserRegistry,
        wallet_address: address
    ): (address, u8, String, String, u64, u64) {
        assert!(table::contains(&registry.users, wallet_address), E_USER_NOT_FOUND);
        
        let user_data = table::borrow(&registry.users, wallet_address);
        (
            user_data.wallet_address,
            user_data.kyc_status,
            user_data.category,
            user_data.cid_hash,
            user_data.created_at,
            user_data.updated_at
        )
    }

    /// Check if user exists
    public fun user_exists(
        registry: &UserRegistry,
        wallet_address: address
    ): bool {
        table::contains(&registry.users, wallet_address)
    }

    /// Get user's KYC status
    public fun get_kyc_status(
        registry: &UserRegistry,
        wallet_address: address
    ): u8 {
        assert!(table::contains(&registry.users, wallet_address), E_USER_NOT_FOUND);
        let user_data = table::borrow(&registry.users, wallet_address);
        user_data.kyc_status
    }

    /// Get user's category
    public fun get_user_category(
        registry: &UserRegistry,
        wallet_address: address
    ): String {
        assert!(table::contains(&registry.users, wallet_address), E_USER_NOT_FOUND);
        let user_data = table::borrow(&registry.users, wallet_address);
        user_data.category
    }

    /// Get user's CID hash
    public fun get_cid_hash(
        registry: &UserRegistry,
        wallet_address: address
    ): String {
        assert!(table::contains(&registry.users, wallet_address), E_USER_NOT_FOUND);
        let user_data = table::borrow(&registry.users, wallet_address);
        user_data.cid_hash
    }

    /// Helper function to check if KYC is verified
    public fun is_kyc_verified(
        registry: &UserRegistry,
        wallet_address: address
    ): bool {
        if (!table::contains(&registry.users, wallet_address)) {
            return false
        };
        let user_data = table::borrow(&registry.users, wallet_address);
        user_data.kyc_status == KYC_VERIFIED
    }

    /// Remove user (admin only)
    public entry fun remove_user(
        registry: &mut UserRegistry,
        _admin_cap: &AdminCap,
        wallet_address: address
    ) {
        assert!(table::contains(&registry.users, wallet_address), E_USER_NOT_FOUND);
        
        let user_data = table::remove(&mut registry.users, wallet_address);
        let UserData { id, wallet_address: _, kyc_status: _, category: _, cid_hash: _, created_at: _, updated_at: _ } = user_data;
        object::delete(id);
    }

    /// Transfer admin capability
    public entry fun transfer_admin(
        registry: &mut UserRegistry,
        admin_cap: AdminCap,
        new_admin: address,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == registry.admin, E_UNAUTHORIZED);
        registry.admin = new_admin;
        transfer::transfer(admin_cap, new_admin);
    }

    /// Get registry admin address
    public fun get_admin(registry: &UserRegistry): address {
        registry.admin
    }

    // Constants for KYC status (for external use)
    public fun kyc_pending(): u8 { KYC_PENDING }
    public fun kyc_verified(): u8 { KYC_VERIFIED }
    public fun kyc_rejected(): u8 { KYC_REJECTED }
}