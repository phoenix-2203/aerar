// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// Minimal stand-in for Circle's FiatToken v2.2: EIP-712 domain, EIP-3009 transferWithAuthorization with a
/// `bytes signature` that accepts EOA (ecrecover) or contract (ERC-1271) signers, as USDC's SignatureChecker does.
contract MockUSDC {
    string public constant name = "USDC";
    string public constant version = "2";

    bytes32 constant TYPEHASH =
        keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    event Transfer(address indexed from, address indexed to, uint256 value);
    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(bytes32 => bool)) public authorizationState;

    /// Computed from address(this), so the code also works when placed at USDC's real address on a local fork.
    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                block.chainid,
                address(this)
            )
        );
    }

    function decimals() external pure returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 v) external {
        balanceOf[to] += v;
    }

    function transfer(address to, uint256 v) external returns (bool) {
        _move(msg.sender, to, v);
        return true;
    }

    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature
    ) external {
        require(block.timestamp > validAfter, "not yet valid");
        require(block.timestamp < validBefore, "expired");
        require(!authorizationState[from][nonce], "used");
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR(), keccak256(abi.encode(TYPEHASH, from, to, value, validAfter, validBefore, nonce)))
        );
        require(_valid(from, digest, signature), "invalid signature");
        authorizationState[from][nonce] = true;
        emit AuthorizationUsed(from, nonce);
        _move(from, to, value);
    }

    function _valid(address signer, bytes32 digest, bytes memory sig) internal view returns (bool) {
        if (signer.code.length == 0) {
            if (sig.length != 65) return false;
            bytes32 r;
            bytes32 s;
            uint8 v;
            assembly {
                r := mload(add(sig, 32))
                s := mload(add(sig, 64))
                v := byte(0, mload(add(sig, 96)))
            }
            return ecrecover(digest, v, r, s) == signer;
        }
        (bool ok, bytes memory ret) = signer.staticcall(abi.encodeWithSelector(0x1626ba7e, digest, sig));
        return ok && ret.length == 32 && abi.decode(ret, (bytes4)) == 0x1626ba7e;
    }

    function _move(address from, address to, uint256 v) internal {
        require(balanceOf[from] >= v, "ERC20: transfer amount exceeds balance");
        balanceOf[from] -= v;
        balanceOf[to] += v;
        emit Transfer(from, to, v);
    }
}
