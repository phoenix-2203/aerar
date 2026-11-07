// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title AerarSeal
/// @notice The Morning Seal. Each morning Aerar writes the head of a workspace's hash-chained audit log here: the
/// hash of its last entry and how many entries there are. Every entry before it is folded into that hash, so from
/// then on nobody, Aerar included, can rewrite the night without the chain no longer matching what Base recorded.
/// @dev Anyone can call `seal`, and every seal records who sealed it: verifiers trust only seals from Aerar's
/// published operator address. A sealer can't overwrite its own seal for the same workspace and sequence number.
contract AerarSeal {
    struct Seal {
        bytes32 head; // hash of the last audit entry sealed
        uint64 seq; // its sequence number
        uint32 entries; // entries in the workspace's chain up to and including it
        uint64 sealedAt;
    }

    /// sealer => workspace (keccak of the org id) => seals, oldest first
    mapping(address => mapping(bytes32 => Seal[])) internal seals;

    event Sealed(address indexed sealer, bytes32 indexed workspace, uint64 seq, bytes32 head, uint32 entries);

    error NotNewer();

    function seal(bytes32 workspace, uint64 seq, bytes32 head, uint32 entries) external {
        Seal[] storage s = seals[msg.sender][workspace];
        if (s.length > 0 && seq <= s[s.length - 1].seq) revert NotNewer();
        s.push(Seal(head, seq, entries, uint64(block.timestamp)));
        emit Sealed(msg.sender, workspace, seq, head, entries);
    }

    function count(address sealer, bytes32 workspace) external view returns (uint256) {
        return seals[sealer][workspace].length;
    }

    function latest(address sealer, bytes32 workspace) external view returns (Seal memory) {
        Seal[] storage s = seals[sealer][workspace];
        require(s.length > 0, "no seal");
        return s[s.length - 1];
    }

    function at(address sealer, bytes32 workspace, uint256 i) external view returns (Seal memory) {
        return seals[sealer][workspace][i];
    }
}
