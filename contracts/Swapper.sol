// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interface/IDexeToken.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

// Uncomment this line to use console.log
// import "hardhat/console.sol";

contract Swapper is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    using SafeERC20 for *;

    IDexeToken public source;
    IERC20 public destination;

    event Swapped(address indexed user, uint256 amount);

    function __Swapper_init(address source_, address destination_) external initializer {
        __Ownable_init();
        _setTokens(source_, destination_);
    }

    function setTokens(address source_, address destination_) external onlyOwner {
        _setTokens(source_, destination_);
    }

    function withdrawTokens(
        address[] calldata tokens,
        uint256[] calldata amounts
    ) external onlyOwner {
        uint256 tokensLength = tokens.length;
        require(tokensLength == amounts.length, "Swapper: arrays of different size");
        for (uint i = 0; i < tokensLength; i++) {
            IERC20(tokens[i]).safeTransfer(msg.sender, amounts[i]);
        }
    }

    function swap(uint256 amount) public {
        source.burn(msg.sender, amount);
        destination.safeTransfer(msg.sender, amount);
        emit Swapped(msg.sender, amount);
    }

    function swapAll() external {
        uint256 amount = source.balanceOf(msg.sender);
        swap(amount);
    }

    function _setTokens(address source_, address destination_) internal {
        source = IDexeToken(source_);
        destination = IERC20(destination_);
    }

    function getImplementation() external view returns (address) {
        return _getImplementation();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
