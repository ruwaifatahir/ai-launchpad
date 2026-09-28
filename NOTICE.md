# Third party notices

AI Launchpad is MIT licensed (see [LICENSE](LICENSE)). It includes work by others, each under its own license.

| Component | Where | Source | License |
| --- | --- | --- | --- |
| Pons V2 contracts | `packages/contracts/contracts/src` | [Pons](https://ponsfamily.com), verified on Robinhood Chain mainnet. Copied unchanged. See [PROVENANCE.md](packages/contracts/PROVENANCE.md). | MIT |
| OpenZeppelin Contracts | `packages/contracts/contracts/lib/openzeppelin-contracts` | [OpenZeppelin](https://github.com/OpenZeppelin/openzeppelin-contracts) | MIT |
| Uniswap v4 core and periphery, Permit2 | `packages/contracts/contracts/lib/v4-*` | [Uniswap](https://github.com/Uniswap) | Per file. `Pool.sol` and `Position.sol` are BUSL 1.1, the rest MIT. |
| Web stylesheet | `apps/web/src/app/styles/pons.css` | Captured from [ponsfamily.com](https://www.ponsfamily.com) | Belongs to Pons. Not covered by this repository's MIT license. |

Every vendored file keeps its original SPDX header. Those headers take precedence over this table.

The BUSL 1.1 files limit production use of that code as a standalone AMM. Read the [Uniswap v4 license](https://github.com/Uniswap/v4-core/blob/main/licenses/BUSL_LICENSE) before deploying.
