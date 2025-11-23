pragma circom 2.0.0;

// Simple circuit: proves knowledge of two secret values
// that hash to a public commitment
template TwoValueProof() {
    // Private inputs (only prover knows)
    signal input secret_value1;
    signal input secret_value2;
    
    // Public inputs (visible on-chain)
    signal input public_commitment;
    signal input recipient_address_hash;
    
    // Output
    signal output valid;
    
    // Constraint: prove knowledge of values that sum to commitment
    // (simplified - use Poseidon hash for production)
    signal sum;
    sum <== secret_value1 + secret_value2;
    
    // Verify the commitment matches
    public_commitment === sum;
    
    // Output is valid if constraints pass
    valid <== 1;
}

component main {public [public_commitment, recipient_address_hash]} = TwoValueProof();