-- ============================================================
-- 037_lia_tenant_provisioning.sql — LIA business identity (Historia 2)
--
-- Adds Peru-specific business/fiscal identity (`tenants`) and
-- physical location (`branches`) on top of the multi-tenant
-- foundation `017_account_sharing.sql` already built.
--
-- Architecture decision (confirmed with product owner 2026-08-07):
--   `accounts` / `is_account_member()` / `account_role_enum` already
--   ARE this app's tenant-isolation system — account_id is already
--   propagated + RLS-checked on every domain table (contacts,
--   conversations, pipelines, flows, …), and `account_role = 'owner'`
--   already IS the spec's "ADMIN_OWNER" (highest role, granted
--   automatically to whoever creates the account at signup — see
--   `handle_new_user()` in 017).
--
--   `tenants` therefore does NOT introduce a second, parallel tenancy
--   root. It is 1:1 business-identity metadata hung off an existing
--   `accounts` row (`tenants.account_id UNIQUE`). Isolation for
--   `tenants`/`branches` reuses `is_account_member()` exactly like
--   every other table — no new RLS primitive, no risk of the two
--   systems drifting out of sync.
--
--   Consequence: there is no new `tenant_id` column on `profiles` and
--   no new role value. "Does this user have a tenant assigned" reads
--   as "does `profiles.account_id` resolve to a row in `tenants`" —
--   exposed below as `get_my_tenant_id()` for the frontend onboarding
--   gate. "Is this user ADMIN_OWNER" reads as
--   `profiles.account_role = 'owner'`.
--
-- What this migration does
--   1. `tenants` — SUNAT/business identity, one row per `accounts`
--      row (nullable until onboarding completes it).
--   2. `branches` — one or more physical locations per tenant.
--   3. RLS on both, mirroring the settings-class (admin+ write)
--      tier used for `whatsapp_config` / `pipelines` in 017.
--   4. `get_my_tenant_id()` — SECURITY DEFINER helper so the
--      Next.js middleware can cheaply check "has this account
--      finished business onboarding" in one round trip.
--
-- Idempotent — safe to run multiple times (IF NOT EXISTS / DROP+
-- CREATE POLICY), consistent with every prior migration in this repo.
-- ============================================================

-- ============================================================
-- TENANTS
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- The tenancy root this business identity belongs to. UNIQUE
  -- because Historia 2 is one business per account in this phase —
  -- relax to non-unique + a "primary tenant" flag if LIA ever needs
  -- multiple legal entities under one account.
  account_id UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,

  -- Denormalised for fast "who provisioned this business" reads,
  -- mirroring accounts.owner_user_id in 017. Not consulted by RLS —
  -- account_id is.
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  identity_type TEXT NOT NULL CHECK (identity_type IN ('empresa', 'marca_personal')),
  tax_id_type TEXT NOT NULL CHECK (tax_id_type IN ('RUC10', 'RUC20')),
  -- SUNAT RUC: exactly 11 numeric digits.
  tax_id TEXT NOT NULL CHECK (tax_id ~ '^[0-9]{11}$'),
  legal_name TEXT NOT NULL,
  commercial_name TEXT NOT NULL,
  main_category TEXT NOT NULL CHECK (
    main_category IN ('medicina_estetica', 'cosmetologia_spa', 'cejas_pestanas', 'salon_belleza')
  ),
  logo_url TEXT,

  -- Fixed for this phase per spec — no commercial plans exist yet.
  -- The CHECK (not just a DEFAULT) keeps it truly "quemado": nothing
  -- can write a different value even by mistake.
  plan_id TEXT NOT NULL DEFAULT 'PLAN_PROVISIONAL_TOTAL'
    CHECK (plan_id = 'PLAN_PROVISIONAL_TOTAL'),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_account ON tenants(account_id);
CREATE INDEX IF NOT EXISTS idx_tenants_owner ON tenants(owner_id);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at ON tenants;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- BRANCHES
-- ============================================================
CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  name TEXT NOT NULL DEFAULT 'Sede Principal',
  address TEXT NOT NULL,
  -- SUNAT ubigeo: exactly 6 numeric digits (departamento+provincia+distrito).
  ubigeo_code TEXT NOT NULL CHECK (ubigeo_code ~ '^[0-9]{6}$'),
  -- Peru mobile number, 9 digits, no country code (stored/displayed
  -- with a phone mask on the frontend per spec).
  whatsapp_number TEXT NOT NULL CHECK (whatsapp_number ~ '^[0-9]{9}$'),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_branches_tenant ON branches(tenant_id);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at ON branches;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON branches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- RLS — TENANTS (settings-class: viewer reads, admin+ writes)
-- ============================================================
DROP POLICY IF EXISTS tenants_select ON tenants;
DROP POLICY IF EXISTS tenants_insert ON tenants;
DROP POLICY IF EXISTS tenants_update ON tenants;
DROP POLICY IF EXISTS tenants_delete ON tenants;

CREATE POLICY tenants_select ON tenants FOR SELECT
  USING (is_account_member(account_id));
CREATE POLICY tenants_insert ON tenants FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY tenants_update ON tenants FOR UPDATE
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY tenants_delete ON tenants FOR DELETE
  USING (is_account_member(account_id, 'admin'));

-- ============================================================
-- RLS — BRANCHES (child of tenants, parent-join semantics like
-- pipeline_stages in 017)
-- ============================================================
DROP POLICY IF EXISTS branches_select ON branches;
DROP POLICY IF EXISTS branches_modify ON branches;

CREATE POLICY branches_select ON branches FOR SELECT USING (
  EXISTS (SELECT 1 FROM tenants t WHERE t.id = branches.tenant_id AND is_account_member(t.account_id))
);
CREATE POLICY branches_modify ON branches FOR ALL USING (
  EXISTS (SELECT 1 FROM tenants t WHERE t.id = branches.tenant_id AND is_account_member(t.account_id, 'admin'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM tenants t WHERE t.id = branches.tenant_id AND is_account_member(t.account_id, 'admin'))
);

-- ============================================================
-- get_my_tenant_id() — onboarding-completion check
--
-- Returns the caller's tenant id, or NULL if their account hasn't
-- finished the Historia 2 onboarding flow yet. SECURITY DEFINER so
-- it can read `profiles`/`tenants` without an extra round trip through
-- RLS (same pattern as `is_account_member`). Used by the Next.js
-- middleware/server components to gate the dashboard per spec §1
-- ("Restricción de Acceso Global").
-- ============================================================
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id
  FROM profiles p
  JOIN tenants t ON t.account_id = p.account_id
  WHERE p.user_id = auth.uid();
$$;

ALTER FUNCTION get_my_tenant_id() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION get_my_tenant_id() TO authenticated;
