const snarkjs = require("snarkjs");
const fs = require("fs");

async function generateProof() {
    // Your two secret values
    const secretValue1 = 100;
    const secretValue2 = 200;
    
    // Public commitment (sum in this simple example)
    const publicCommitment = secretValue1 + secretValue2;
    
    // Recipient address hash (simplified)
    const recipientAddressHash = "0x1234..."; // Your recipient address

    // Input for the circuit
    const input = {
        secret_value1: secretValue1,
        secret_value2: secretValue2,
        public_commitment: publicCommitment,
        recipient_address_hash: recipientAddressHash
    };

    console.log("Generating proof for inputs:", input);

    // Generate the proof
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        input,
        "circuit.wasm",      // Compiled circuit
        "circuit_final.zkey" // Proving key
    );

    console.log("Proof generated!");
    console.log("Public signals:", publicSignals);

    // Convert proof to bytes for Sui
    const proofBytes = await formatProofForSui(proof);
    const publicInputBytes = formatPublicInputsForSui(publicSignals);

    // Save for use with Sui
    fs.writeFileSync("proof_bytes.json", JSON.stringify({
        proof_bytes: proofBytes,
        public_inputs: publicInputBytes,
        recipient: recipientAddressHash
    }, null, 2));

    console.log("Proof saved to proof_bytes.json");
    
    return { proofBytes, publicInputBytes };
}

// Format Groth16 proof for Sui's expected format
async function formatProofForSui(proof) {
    // Sui expects proof points as concatenated bytes
    // [pi_a (64 bytes), pi_b (128 bytes), pi_c (64 bytes)]
    
    const pi_a = proof.pi_a.slice(0, 2).map(s => BigInt(s));
    const pi_b = proof.pi_b.slice(0, 2).map(arr => arr.map(s => BigInt(s)));
    const pi_c = proof.pi_c.slice(0, 2).map(s => BigInt(s));

    let bytes = [];
    
    // Add pi_a (G1 point)
    for (const coord of pi_a) {
        bytes.push(...bigIntToBytes32(coord));
    }
    
    // Add pi_b (G2 point) - note the order swap for BN254
    for (const coordPair of pi_b) {
        for (const coord of coordPair.reverse()) {
            bytes.push(...bigIntToBytes32(coord));
        }
    }
    
    // Add pi_c (G1 point)
    for (const coord of pi_c) {
        bytes.push(...bigIntToBytes32(coord));
    }

    return bytes;
}

function formatPublicInputsForSui(publicSignals) {
    let bytes = [];
    for (const signal of publicSignals) {
        bytes.push(...bigIntToBytes32(BigInt(signal)));
    }
    return bytes;
}

function bigIntToBytes32(n) {
    const hex = n.toString(16).padStart(64, '0');
    const bytes = [];
    for (let i = 0; i < 64; i += 2) {
        bytes.push(parseInt(hex.substr(i, 2), 16));
    }
    return bytes;
}

// Verify proof locally before sending to chain
async function verifyProofLocally() {
    const vkey = JSON.parse(fs.readFileSync("verification_key.json"));
    const proof = JSON.parse(fs.readFileSync("proof.json"));
    const publicSignals = JSON.parse(fs.readFileSync("public.json"));

    const isValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
    console.log("Local verification:", isValid ? "VALID" : "INVALID");
    return isValid;
}

generateProof().catch(console.error);