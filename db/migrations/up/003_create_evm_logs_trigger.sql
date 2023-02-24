CREATE OR REPLACE FUNCTION evm.logs_upsert_notify()
RETURNS trigger
AS $$
  BEGIN
    PERFORM pg_notify('evm_logs_upsert_notify', row_to_json(NEW)::text);
    RETURN NEW;
  END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER upsert
AFTER INSERT OR UPDATE ON evm.logs
FOR EACH ROW EXECUTE PROCEDURE evm.logs_upsert_notify();
