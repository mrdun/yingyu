-- Admin bootstrap for Logto (organization-less role + scope model)
-- Replay on a fresh environment against the Logto Postgres DB:
--   docker exec -i <logto-postgres-container> psql -U postgres -d logto < scripts/setup-admin-logto.sql
--
-- Notes:
-- - The API resource for the earthworm backend must already exist
--   (indicator = http://localhost:3001/, created via Logto console/CLI).
-- - Role name 'default:admin' is a *User*-type business role in the 'default' tenant.
-- - Idempotent: safe to run multiple times.

-- 1) Create scope 'admin:access' under the backend API resource
INSERT INTO scopes (tenant_id, id, resource_id, name, description)
SELECT 'default', 'admacc0000000000000', 'k9b22v5stmqbpw37cx27z', 'admin:access', 'Access admin console APIs'
WHERE NOT EXISTS (
  SELECT 1 FROM scopes
  WHERE tenant_id = 'default' AND resource_id = 'k9b22v5stmqbpw37cx27z' AND name = 'admin:access'
);

-- 2) Create the business role 'default:admin' (User type, 'default' tenant)
INSERT INTO roles (tenant_id, id, name, description, type, is_default)
SELECT 'default', 'defadmin00000000000', 'default:admin', 'Admin console access for earthworm API', 'User', false
WHERE NOT EXISTS (
  SELECT 1 FROM roles WHERE tenant_id = 'default' AND name = 'default:admin'
);

-- 3) Bind the scope to the role
INSERT INTO roles_scopes (tenant_id, id, role_id, scope_id)
SELECT 'default', 'defadmrs00000000001', r.id, s.id
FROM roles r, scopes s
WHERE r.tenant_id = 'default' AND r.name = 'default:admin'
  AND s.tenant_id = 'default' AND s.name = 'admin:access' AND s.resource_id = 'k9b22v5stmqbpw37cx27z'
ON CONFLICT DO NOTHING;

-- 4) (Dev convenience) Assign the role to ALL registered users in the default tenant,
--    so their JWTs contain 'admin:access'. For production, insert only for real admins.
INSERT INTO users_roles (tenant_id, id, user_id, role_id)
SELECT 'default', 'defadmur' || u.id, u.id, r.id
FROM users u, roles r
WHERE r.tenant_id = 'default' AND r.name = 'default:admin' AND u.tenant_id = 'default'
ON CONFLICT DO NOTHING;
