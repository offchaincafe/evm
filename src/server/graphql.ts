import konsole from "@/services/konsole.js";
import { toBuffer, toHex } from "@/utils.js";
import * as pg from "@/services/pg.js";
import { createSchema, createYoga } from "graphql-yoga";
import { ethers } from "ethers";
import { GraphQLError } from "graphql";
import * as config from "@/config.js";
import * as redis from "@/services/redis.js";
import { nanoid } from "nanoid";
import { fetchBlockTimestamp } from "@/services/eth.js";

// TODO: Count log queries.

type Log = {
  transaction: Transaction;
  block: Block;
  logIndex: number;
  data: Buffer;
  topics: (Buffer | null)[];
};

type Block = {
  number: number;
  timestamp: number;
};

type Transaction = {
  hash: Buffer;
};

type LogRow = {
  block_number: number;
  log_index: number;
  tx_hash: Buffer;
  contract_address: Buffer;
  data: Buffer;
  topic0: string;
  topic1: string | null;
  topic2: string | null;
  topic3: string | null;
  db_created_at: Date;
};

const latestChainBlockNumberKey = `${redis.prefix}latestBlockNumber`;

async function getLatestChainBlock(): Promise<{
  number: number;
}> {
  return {
    number: parseInt(
      (await redis.client.get(latestChainBlockNumberKey)) || "0"
    ),
  };
}

function padTopic(topic: string): string {
  if (topic.length === 66) return topic;
  return "0x" + topic.slice(2).padStart(64, "0");
}

export const yoga = createYoga({
  schema: createSchema({
    typeDefs: /* GraphQL */ `
      # enum ContractOrderBy {
      #   QUERYING_POPULARITY
      #   FIRST_TIME_ACTIVATED
      # }

      type Meta {
        chain: Chain!
      }

      type Chain {
        id: Int!
        latestBlock: Block!
      }

      type Block {
        number: Int!
        timestamp: Int! # Unix timestamp
      }

      type Transaction {
        hash: String! # 0x string
      }

      type Contract {
        address: String! # 0x string
        creationBlock: Block!

        logs(
          # For example, \`[["a", "b"], ["c"]]\` turns into
          # \`WHERE (topics->>0 = "a" OR topics->>0 = "b") AND topics->>1 = "c"\`.
          # NOTE: The first topic is always the event signature.
          topics: [[String]]

          limit: Int # Default: 10, max: 100, min: 1
          fromBlock: Int # Default: contract creation block (0)
          toBlock: Int # Default: most recent block (-1)
        ): [Log]!
      }

      type Log {
        block: Block!
        logIndex: Int!
        transaction: Transaction!
        data: String! # 0x string, excluding the topics
        topics: [String]! # 0x strings, including nulls
      }

      type Query {
        meta: Meta!

        contract(
          address: String! # 0x string
        ): Contract
      }
    `,
    resolvers: {
      Query: {
        meta: async () => {
          return {
            chain: {
              id: config.default.eth.chainId,
              latestBlock: await getLatestChainBlock(),
            },
          };
        },

        contract: async (
          _,
          { address }: { address: string }
        ): Promise<config.Contract | undefined> => {
          return config.default.contracts.find((contract) =>
            contract.address.equals(toBuffer(address.toLowerCase()))
          );
        },
      },

      Meta: {
        chain: (parent: any): any => parent.chain,
      },

      Chain: {
        id: (parent: any): any => parent.id,
        latestBlock: (parent: any): any => parent.latestBlock,
      },

      Contract: {
        address: (parent: config.Contract): string => toHex(parent.address),

        creationBlock: (parent: config.Contract): Block => {
          return {
            number: parent.creationBlock,
            timestamp: null!,
          };
        },

        logs: async (
          parent: config.Contract,
          {
            topics = [],
            limit = 10,
            fromBlock = 0,
            toBlock = -1,
          }: {
            topics: string[][];
            limit: number;
            fromBlock: number;
            toBlock: number;
          }
        ): Promise<Log[]> => {
          if (limit > 100 || limit < 1) {
            throw new GraphQLError("Invalid `limit` argument");
          }

          if (topics.length > 4) {
            throw new GraphQLError("Too many topics");
          }

          let query = "SELECT * FROM evm.logs";
          const queryArgs: any[] = [];

          let whereClause = `WHERE contract_address = $1`;
          queryArgs.push(toBuffer(parent.address));

          // Convert [["a", "b"], [], [], ["c"]] to
          // `AND ((topic0 = IN ("a", "b")) AND (topic2 IN "c"))`.
          if (topics.length > 0) {
            whereClause += " AND (";

            for (let i = 0; i < topics.length; i++) {
              if (topics[i].length > 0) {
                whereClause += `topic${i} IN (`;

                for (let j = 0; j < topics[i].length; j++) {
                  whereClause += `LOWER($${queryArgs.length + 1})`;
                  queryArgs.push(padTopic(topics[i][j]));
                  if (j < topics[i].length - 1) whereClause += ", ";
                }

                whereClause += ")";

                if (i < topics.length - 1) whereClause += " AND ";
              }
            }

            whereClause += ")";
          }

          // All the blocks which the contract existed in is the block range.
          // `fromBlock` and `toBlock` are indices in this range,
          // where negative indices are counted from the end:
          // -1 is the last block, -2 is the second-to-last block, etc.
          //

          let ordering: "ASC" | "DESC" = "ASC";

          if (fromBlock === toBlock) {
            whereClause += ` AND block_number = $${queryArgs.length + 1}`;
            queryArgs.push(fromBlock);
          } else {
            whereClause += ` AND block_number BETWEEN $${
              queryArgs.length + 1
            } AND $${queryArgs.length + 2}`;

            if (fromBlock >= 0 && toBlock >= 0) {
              if (fromBlock < toBlock) {
                ordering = "ASC";
                queryArgs.push(fromBlock, toBlock);
              } else {
                ordering = "DESC";
                queryArgs.push(toBlock, fromBlock);
              }
            } else {
              const latestChainBlock = (await getLatestChainBlock()).number;

              if (fromBlock >= 0 && toBlock < 0) {
                ordering = "ASC";
                queryArgs.push(fromBlock, latestChainBlock + toBlock + 1);
              } else if (fromBlock < 0 && toBlock >= 0) {
                ordering = "DESC";
                queryArgs.push(toBlock, latestChainBlock + fromBlock + 1);
              } else if (fromBlock < 0 && toBlock < 0) {
                if (fromBlock < toBlock) {
                  ordering = "ASC";
                  queryArgs.push(
                    latestChainBlock + fromBlock + 1,
                    latestChainBlock + toBlock + 1
                  );
                } else {
                  ordering = "DESC";
                  queryArgs.push(
                    latestChainBlock + toBlock + 1,
                    latestChainBlock + fromBlock + 1
                  );
                }
              } else {
                throw new GraphQLError("Invalid block range");
              }
            }
          }

          query += ` ${whereClause}`;
          query += ` ORDER BY block_number ${ordering}, log_index ${ordering}`;
          query += ` LIMIT ${limit}`;

          const id = nanoid();
          konsole.debug(["graphql", "logs"], "Querying events...", {
            id,
            request: {
              topics: JSON.stringify(topics),
              limit,
              fromBlock,
              toBlock,
            },
            query,
            queryArgs,
          });

          const result = await pg.pool.query(query, queryArgs);
          konsole.debug(["graphql", "logs"], "Query result", {
            id,
            rows: result.rows,
          });

          return result.rows.map(
            (row: LogRow): Log => ({
              transaction: {
                hash: row.tx_hash,
              },
              block: {
                number: row.block_number,
                timestamp: null!,
              },
              logIndex: row.log_index,
              data: row.data,
              topics: [
                toBuffer(row.topic0),
                row.topic1 ? toBuffer(row.topic1) : null,
                row.topic2 ? toBuffer(row.topic2) : null,
                row.topic3 ? toBuffer(row.topic3) : null,
              ],
            })
          );
        },
      },

      Log: {
        block: (parent: Log): Block => parent.block,
        logIndex: (parent: Log): number => parent.logIndex,
        transaction: (parent: Log): Transaction => parent.transaction,
        data: (parent: Log): string => toHex(parent.data),
        topics: (parent: Log): (string | null)[] =>
          parent.topics.map((topic) =>
            topic ? toHex(topic) : ethers.constants.HashZero
          ),
      },

      Block: {
        number: (parent: Block): number => parent.number,
        timestamp: async (parent: Block): Promise<number> =>
          await fetchBlockTimestamp(parent.number),
      },

      Transaction: {
        hash: (parent: Transaction): string => toHex(parent.hash),
      },
    },
  }),
  graphqlEndpoint: "/graphql",
  healthCheckEndpoint: "/graphql/health",
});
