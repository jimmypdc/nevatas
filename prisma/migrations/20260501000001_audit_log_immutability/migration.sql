-- AuditEvent rows are append-only. This migration enforces that at the
-- database layer so the invariant survives even if application code,
-- direct psql sessions, or future Prisma migrations attempt to modify them.
--
-- Application code never calls update/delete on AuditEvent today; the trigger
-- catches mistakes (and protects against an attacker who has a database
-- connection but not OS-level superuser privileges).
--
-- A future migration will add a separate role + SECURITY DEFINER function
-- for SOC 2 retention deletion (which must run only as part of a documented
-- retention/deletion workflow).

CREATE OR REPLACE FUNCTION nevatas_reject_audit_event_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'AuditEvent rows are append-only and cannot be modified or deleted'
    USING ERRCODE = '42501', -- insufficient_privilege
          HINT = 'See prisma/migrations/20260501000001_audit_log_immutability';
END;
$$;

DROP TRIGGER IF EXISTS audit_event_no_update ON "AuditEvent";
CREATE TRIGGER audit_event_no_update
BEFORE UPDATE ON "AuditEvent"
FOR EACH ROW EXECUTE FUNCTION nevatas_reject_audit_event_mutation();

DROP TRIGGER IF EXISTS audit_event_no_delete ON "AuditEvent";
CREATE TRIGGER audit_event_no_delete
BEFORE DELETE ON "AuditEvent"
FOR EACH ROW EXECUTE FUNCTION nevatas_reject_audit_event_mutation();

-- TRUNCATE bypasses row-level triggers; install a statement-level guard.
DROP TRIGGER IF EXISTS audit_event_no_truncate ON "AuditEvent";
CREATE TRIGGER audit_event_no_truncate
BEFORE TRUNCATE ON "AuditEvent"
FOR EACH STATEMENT EXECUTE FUNCTION nevatas_reject_audit_event_mutation();

COMMENT ON FUNCTION nevatas_reject_audit_event_mutation() IS
  'Enforces append-only semantics on AuditEvent. Do not drop without a documented retention/deletion workflow.';
