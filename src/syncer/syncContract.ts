import { sleep, ternaryPipe, toBuffer, toHex } from "@/utils.js";
import * as redis from "@/services/redis.js";
import { ethers } from "ethers";
import { httpProvider, wsProvider } from "@/services/eth.js";
import * as pg from "@/services/pg.js";
import * as config from "@/config.js";
import konsole from "@/services/konsole.js";
import pRetry from "p-retry";
import { nanoid } from "nanoid";

// TODO: Handle "removed: true".

const BATCH_SIZE = 5760; // Approximately 24 hours

function splitTopics(topics: string[]): [string, string?, string?, string?] {
  return [topics[0], topics[1], topics[2], topics[3]];
}

/**
 * @param getHistoricalBlock Get the latest synced historical block from the env.
 * If this is null, then the contract has never been synced before,
 * and we should start from {@link config.Contract.creationBlock}.
 *
 * @param currentBlock The current block number,
 * used to determine when to stop historical syncing.
 */
async function syncHistoricalLogs(
  contract: config.Contract,
  currentBlock: number,
  getHistoricalBlock: () => Promise<number | null>,
  insertLogs: (
    logs: ethers.providers.Log[],
    historicalBlock?: number
  ) => Promise<void>,
  cancel: () => boolean
) {
  let fromBlock = (await getHistoricalBlock()) || contract.creationBlock;
  let toBlock = Math.min(fromBlock + BATCH_SIZE, currentBlock);

  while (fromBlock < toBlock && !cancel()) {
    konsole.log(["syncer"], "Querying logs...", {
      address: toHex(contract.address),
      fromBlock,
      toBlock,
      currentBlock,
    });

    const logs = await pRetry(() =>
      httpProvider.getLogs({
        address: toHex(contract.address),
        fromBlock,
        toBlock,
      })
    );

    if (logs.length > 0) {
      await insertLogs(logs, toBlock);
    }

    fromBlock = toBlock;
    toBlock = Math.min(fromBlock + BATCH_SIZE, currentBlock);
  }
}

async function syncRealtimeLogs(
  contract: config.Contract,
  insert: (logs: ethers.providers.Log[]) => Promise<void>,
  cancel: () => boolean
) {
  wsProvider.on({ address: toHex(contract.address) }, async (log) => {
    // We don't want to update historical block here, because a realtime log
    // may come in before the historical logs are inserted.
    await insert([log]);
  });

  while (!cancel()) {
    await sleep(1000);
  }

  wsProvider.off({ address: toHex(contract.address) });
}

async function syncContractImpl(
  contract: config.Contract,
  insertLogs: (logs: ethers.providers.Log[]) => Promise<void>
): Promise<() => Promise<void>> {
  const redisKey = `${redis.prefix}contract:${contract.address}:latestSyncedHistoricalLogBlock`;

  const currentBlock = await pRetry(() => httpProvider.getBlockNumber());

  let cancel = false;
  const promises = [
    syncHistoricalLogs(
      contract,
      currentBlock,
      async () => ternaryPipe(redis.client.get(redisKey), parseInt),
      async (logs, historicalBlock) => {
        await insertLogs(logs);

        if (historicalBlock) {
          await redis.client.set(redisKey, historicalBlock.toString());
        }
      },
      () => cancel
    ),

    syncRealtimeLogs(contract, insertLogs, () => cancel),
  ];

  return async () => {
    cancel = true;
    await Promise.all(promises);
  };
}

/**
 * Continiuosly synchonize events from a generic contract to the database.
 * @returns cancellation function
 */
export async function syncContract(
  contract: config.Contract
): Promise<() => Promise<void>> {
  konsole.info(["syncer"], `Syncing...`, {
    address: toHex(contract.address),
  });

  return syncContractImpl(contract, async (logs) => {
    const pgClient = await pg.pool.connect();

    try {
      for (const log of logs) {
        const id = nanoid();

        konsole.log(["syncer"], `Inserting log...`, { id, log });
        await pgClient.query(`BEGIN`);

        await pgClient.query(
          `INSERT INTO evm.logs (
            block_number,
            log_index,
            tx_hash,
            contract_address,
            data,
            topic0,
            topic1,
            topic2,
            topic3
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9
          ) ON CONFLICT DO NOTHING`,
          [
            log.blockNumber,
            log.logIndex,
            toBuffer(log.transactionHash),
            toBuffer(log.address),
            toBuffer(log.data),
            ...splitTopics(log.topics),
          ]
        );

        await pgClient.query(`COMMIT`);
        konsole.info(["syncer"], `Inserted log!`, { id });
      }
    } finally {
      pgClient.release();
    }
  });
}
