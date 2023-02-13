# Offchain Café: EVM

A simple-to-use EVM chain indexing made for Web3 applications.

## Features

- Synchronize contract logs
- Serve the logs via GraphQL, including realtime subscriptions

## Usage

To run Offchain Café: EVM, you'll need the following:

- A PostgreSQL database (`DATABASE_URL`)
- A Redis instance (`REDIS_URL`)
- An Ethereum RPC endpoint (`ETH_CHAIN_ID`, `ETH_HTTP_RPC_URL` and `ETH_WS_RPC_URL` (optional, but recommended))
- Addresses and deploy block numbers of the contracts you want to index

1. Prepare `contracts.json` (see `contracts.example.json` for an example)
2. Prepare environment (see `env.example` for an example)
3. Run `pnpm install && pnpm build`
4. Run `pnpm db:migrate` to create the database schema
5. Run `pnpm start`

You should now have the GraphQL API endpoint running at `/graphql`.
Enjoy! ☕️

### Client examples

This example uses [@urql/core](https://formidable.com/open-source/urql/) in NodeJS environment.

<details>
<summary><code>offchainCafe.ts</code></summary>

```typescript
import { createClient, defaultExchanges } from "@urql/core";
import { yogaExchange } from "@graphql-yoga/urql-exchange";

const client = createClient({
  url: "http://<OFFCHAIN_SERVER_HOST>:<OFFCHAIN_SERVER_PORT>/graphql",
  exchanges: [...defaultExchanges, yogaExchange()],
});

export default client;
```

</details>

<details>
<summary><code>queryLogs.ts</code></summary>

```typescript
import { gql } from "@urql/core";
import offchainCafe from "./offchainCafe";
import receiverAbi from "~/abi/receiver.json" assert { type: "json" };

const receiverAddress = "0x...";
const iface = new ethers.utils.Interface(receiverAbi);
const receiveEventTopic = iface.getEventTopic("Receive");

const fromBlock = 0; // 0 means contract creation block
const toBlock = -1; // -1 means the latest chain block

const logs = (
  await offchainCafe
    .query(
      gql`
        query ContractLogs(
          $fromBlock: Int!,
          $toBlock: Int!
        ) {
          contract(address: "${receiverAddress}") {
            logs(
              topics: [["${receiveEventTopic}"]],
              limit: 10,
              fromBlock: $fromBlock,
              toBlock: $toBlock
            ) {
                block {
                  number
                  timestamp
                }
                logIndex
                transaction {
                  hash
                }
                data
                topics
            }
          }
        }`,
      { fromBlock, toBlock }
    )
    .toPromise()
).data.contract.logs;
```

</details>

<details>
<summary><code>subscribeToLogs.ts</code></summary>

```typescript
import { pipe, subscribe } from "wonka";
import { gql } from "@urql/core";
import offchainCafe from "./offchainCafe";
import receiverAbi from "~/abi/receiver.json" assert { type: "json" };

const receiverAddress = "0x...";
const iface = new ethers.utils.Interface(receiverAbi);
const receiveEventTopic = iface.getEventTopic("Receive");

const { unsubscribe } = pipe(
  offchainCafe.subscription(
    gql`
      subscription {
        log(
          contractAddress: "${receiverAddress}",
          topics: [["${receiveEventTopic}"]]
        ) {
          block {
            number
            timestamp
          }
          logIndex
          transaction {
            hash
          }
          data
          topics
        }
      }`,
    {}
  ),
  subscribe(async (result) => {
    const log = result.data!.log;
  })
);
```

</details>
