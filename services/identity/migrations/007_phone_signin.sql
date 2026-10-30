-- Phone-only accounts retain the canonical user id; no synthetic email identity.
ALTER TABLE platform.users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE platform.users ADD COLUMN phone_number text UNIQUE CHECK (phone_number ~ '^\+2376[0-9]{8}$');
ALTER TABLE platform.users ADD COLUMN phone_verified_at timestamptz;
ALTER TABLE platform.users ADD CONSTRAINT users_contact_required CHECK (email IS NOT NULL OR phone_number IS NOT NULL);
ALTER TABLE platform.sso_sessions DROP CONSTRAINT sso_sessions_method_check;
ALTER TABLE platform.sso_sessions ADD CONSTRAINT sso_sessions_method_check CHECK (method IN ('password','google','phone'));
CREATE TABLE platform.phone_challenges (
 id uuid PRIMARY KEY,
 phone_number text NOT NULL,
 code_hash text NOT NULL,
 browser_hash text NOT NULL,
 user_id uuid REFERENCES platform.users(id),
 purpose text NOT NULL CHECK (purpose IN ('signin','link')),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 expires_at timestamptz NOT NULL,
 used_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX phone_challenges_number_created ON platform.phone_challenges(phone_number,created_at DESC);
REVOKE ALL ON platform.phone_challenges FROM PUBLIC;

-- A phone-first account may add an email only by proving the mailbox and its chosen password.
ALTER TABLE platform.email_tokens DROP CONSTRAINT email_tokens_purpose_check;
ALTER TABLE platform.email_tokens ADD CONSTRAINT email_tokens_purpose_check CHECK (purpose IN ('verify_email','reset_password','link_email'));
ALTER TABLE platform.email_tokens ADD COLUMN pending_email text;
