CREATE SCHEMA ads_subscriptions;
DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='ads_subscriptions_runtime') THEN
 CREATE ROLE ads_subscriptions_runtime NOLOGIN NOBYPASSRLS; END IF; END $$;
REVOKE ALL ON SCHEMA ads_subscriptions FROM PUBLIC;
GRANT USAGE ON SCHEMA ads_subscriptions TO ads_subscriptions_runtime;

CREATE TABLE ads_subscriptions.plans(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product text NOT NULL, key text NOT NULL,
 name jsonb NOT NULL, current_version integer NOT NULL DEFAULT 0 CHECK(current_version>=0),
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(product,key), UNIQUE(id,product)
);
CREATE TABLE ads_subscriptions.tariffs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_id uuid NOT NULL, product text NOT NULL,
 version integer NOT NULL CHECK(version>0), amount_xaf bigint NOT NULL CHECK(amount_xaf BETWEEN 0 AND 10000000000),
 effective_at timestamptz NOT NULL, duration_days integer NOT NULL CHECK(duration_days BETWEEN 1 AND 3660),
 renewal_rule text NOT NULL CHECK(renewal_rule IN ('NONE','MANUAL')),
 funding text NOT NULL CHECK(funding IN ('FREE','PAID','PROMOTIONAL','SPONSORED')),
 entitlements jsonb NOT NULL CHECK(jsonb_typeof(entitlements)='array'),
 usage_limits jsonb NOT NULL CHECK(jsonb_typeof(usage_limits)='object'),
 eligible_tenant_ids uuid[] NOT NULL DEFAULT '{}', created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(plan_id,version), UNIQUE(id,plan_id,product),
 FOREIGN KEY(plan_id,product) REFERENCES ads_subscriptions.plans(id,product),
 CHECK((funding='FREE' AND amount_xaf=0) OR (funding='PAID' AND amount_xaf>0) OR funding IN ('PROMOTIONAL','SPONSORED'))
);
CREATE TABLE ads_subscriptions.subscriptions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, product text NOT NULL,
 plan_id uuid NOT NULL, tariff_id uuid NOT NULL, snapshot jsonb NOT NULL,
 state text NOT NULL CHECK(state IN ('PENDING_PAYMENT','ACTIVE','CANCELLED')),
 starts_at timestamptz, ends_at timestamptz, cancelled_at timestamptz,
 version integer NOT NULL DEFAULT 1 CHECK(version>0), created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tariff_id,plan_id,product) REFERENCES ads_subscriptions.tariffs(id,plan_id,product),
 CHECK((state='PENDING_PAYMENT' AND starts_at IS NULL AND ends_at IS NULL AND cancelled_at IS NULL)
 OR (state='ACTIVE' AND starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at>starts_at AND cancelled_at IS NULL)
 OR (state='CANCELLED' AND cancelled_at IS NOT NULL))
);
CREATE INDEX subscription_entitlement_lookup ON ads_subscriptions.subscriptions(tenant_id,product,state,ends_at);
CREATE FUNCTION ads_subscriptions.tariff_terms(t ads_subscriptions.tariffs) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('id',t.id,'plan_id',t.plan_id,'product',t.product,'version',t.version,'amount_xaf',t.amount_xaf,
 'effective_at',t.effective_at,'duration_days',t.duration_days,'renewal_rule',t.renewal_rule,'funding',t.funding,
 'entitlements',t.entitlements,'usage_limits',t.usage_limits)
$$;
CREATE FUNCTION ads_subscriptions.check_selection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t ads_subscriptions.tariffs; current_tariff uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('plan:'||NEW.plan_id::text,0));
 SELECT * INTO t FROM ads_subscriptions.tariffs WHERE id=NEW.tariff_id;
 SELECT id INTO current_tariff FROM ads_subscriptions.tariffs WHERE plan_id=NEW.plan_id AND effective_at<=now() ORDER BY effective_at DESC,version DESC LIMIT 1;
 IF t.id IS NULL OR current_tariff IS DISTINCT FROM NEW.tariff_id OR NEW.snapshot IS DISTINCT FROM ads_subscriptions.tariff_terms(t)
 OR (NEW.state='ACTIVE' AND t.amount_xaf<>0) OR NEW.state='CANCELLED'
 OR t.effective_at>now() OR (cardinality(t.eligible_tenant_ids)>0 AND NOT NEW.tenant_id=ANY(t.eligible_tenant_ids)) THEN
  RAISE EXCEPTION 'INVALID_SUBSCRIPTION_SELECTION' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER subscription_selection BEFORE INSERT ON ads_subscriptions.subscriptions FOR EACH ROW EXECUTE FUNCTION ads_subscriptions.check_selection();
CREATE TABLE ads_subscriptions.audit(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, tenant_id uuid NOT NULL, actor_ref text NOT NULL,
 product text NOT NULL, action text NOT NULL, target_id uuid NOT NULL,
 before_value jsonb, after_value jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ads_subscriptions.requests(
 tenant_id uuid NOT NULL, actor_ref text NOT NULL, product text NOT NULL, operation text NOT NULL, request_key text NOT NULL,
 request_hash text NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,actor_ref,product,operation,request_key)
);

ALTER TABLE ads_subscriptions.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads_subscriptions.plans FORCE ROW LEVEL SECURITY;
CREATE POLICY plan_read ON ads_subscriptions.plans FOR SELECT USING(
 current_setting('ads_subscriptions.operator',true)='true' OR product=current_setting('ads_subscriptions.product',true));
CREATE POLICY plan_insert ON ads_subscriptions.plans FOR INSERT WITH CHECK(current_setting('ads_subscriptions.operator',true)='true');
CREATE POLICY plan_update ON ads_subscriptions.plans FOR UPDATE USING(current_setting('ads_subscriptions.operator',true)='true') WITH CHECK(current_setting('ads_subscriptions.operator',true)='true');
ALTER TABLE ads_subscriptions.tariffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads_subscriptions.tariffs FORCE ROW LEVEL SECURITY;
CREATE POLICY tariff_read ON ads_subscriptions.tariffs FOR SELECT USING(
 current_setting('ads_subscriptions.operator',true)='true' OR product=current_setting('ads_subscriptions.product',true));
CREATE POLICY tariff_insert ON ads_subscriptions.tariffs FOR INSERT WITH CHECK(current_setting('ads_subscriptions.operator',true)='true');
ALTER TABLE ads_subscriptions.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads_subscriptions.subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY subscription_scope ON ads_subscriptions.subscriptions FOR ALL
 USING(tenant_id=NULLIF(current_setting('ads_subscriptions.tenant',true),'')::uuid AND product=current_setting('ads_subscriptions.product',true))
 WITH CHECK(tenant_id=NULLIF(current_setting('ads_subscriptions.tenant',true),'')::uuid AND product=current_setting('ads_subscriptions.product',true));
ALTER TABLE ads_subscriptions.audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads_subscriptions.audit FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_scope ON ads_subscriptions.audit FOR ALL
 USING(tenant_id=NULLIF(current_setting('ads_subscriptions.tenant',true),'')::uuid AND product=current_setting('ads_subscriptions.product',true))
 WITH CHECK(tenant_id=NULLIF(current_setting('ads_subscriptions.tenant',true),'')::uuid AND product=current_setting('ads_subscriptions.product',true)
 AND actor_ref=current_setting('ads_subscriptions.actor',true));
ALTER TABLE ads_subscriptions.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads_subscriptions.requests FORCE ROW LEVEL SECURITY;
CREATE POLICY request_scope ON ads_subscriptions.requests FOR ALL
 USING(tenant_id=NULLIF(current_setting('ads_subscriptions.tenant',true),'')::uuid AND actor_ref=current_setting('ads_subscriptions.actor',true) AND product=current_setting('ads_subscriptions.product',true))
 WITH CHECK(tenant_id=NULLIF(current_setting('ads_subscriptions.tenant',true),'')::uuid AND actor_ref=current_setting('ads_subscriptions.actor',true) AND product=current_setting('ads_subscriptions.product',true));

CREATE FUNCTION ads_subscriptions.immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'SUBSCRIPTION_EVIDENCE_IMMUTABLE' USING ERRCODE='23514'; END $$;
CREATE TRIGGER tariff_immutable BEFORE UPDATE OR DELETE ON ads_subscriptions.tariffs FOR EACH ROW EXECUTE FUNCTION ads_subscriptions.immutable();
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON ads_subscriptions.audit FOR EACH ROW EXECUTE FUNCTION ads_subscriptions.immutable();
CREATE TRIGGER request_immutable BEFORE UPDATE OR DELETE ON ads_subscriptions.requests FOR EACH ROW EXECUTE FUNCTION ads_subscriptions.immutable();

GRANT SELECT,INSERT ON ads_subscriptions.plans,ads_subscriptions.tariffs,ads_subscriptions.subscriptions,ads_subscriptions.audit,ads_subscriptions.requests TO ads_subscriptions_runtime;
GRANT UPDATE(current_version) ON ads_subscriptions.plans TO ads_subscriptions_runtime;
-- First slice can cancel; no route or runtime privilege activates paid subscriptions.
GRANT UPDATE(state,cancelled_at,version) ON ads_subscriptions.subscriptions TO ads_subscriptions_runtime;
GRANT USAGE ON SEQUENCE ads_subscriptions.audit_id_seq TO ads_subscriptions_runtime;
