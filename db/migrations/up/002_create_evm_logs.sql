CREATE EXTENSION IF NOT EXISTS bloom;

CREATE table
  evm.logs (
    block_number INT NOT NULL,
    log_index INT NOT NULL, -- Log index within the block

    tx_hash BYTEA NOT NULL,
    contract_address BYTEA NOT NULL,

    data BYTEA NOT NULL,

    topic0 TEXT NOT NULL, -- The first topic is the log signature
    topic1 TEXT,
    topic2 TEXT,
    topic3 TEXT,

    db_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- When the log was inserted into the database

    PRIMARY KEY (block_number, log_index)
  );

CREATE INDEX evm_logs_contract_address_idx ON evm.logs (contract_address);
CREATE INDEX evm_logs_topics_idx ON evm.logs USING bloom (topic0, topic1, topic2, topic3);
