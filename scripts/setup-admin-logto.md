# Admin Logto 初始化说明

权限体系采用 Logto **organization-less** 的 role + scope 模型, 不引入 organization 复杂度。

## 结构

- API resource: `http://localhost:3001/` (earthworm 后端)
- Scope: `admin:access` (挂在该 resource 下)
- 业务角色: `default:admin` (User 类型, default tenant), 绑定 `admin:access` scope
- 用户提权: 向 `users_roles` 插入 (user_id, role_id) 即可; 用户下次签发的 JWT
  (client 在 plugins/logto.ts 中已带 `resources: [backendEndpoint]` 请求 token)
  的 `scope` claim 会包含 `admin:access` (空格分隔), 后端 `AuthGuard` +
  `@Permissions('admin:access')` 校验通过。

## 重放

```bash
docker exec -i <logto-postgres-container> psql -U postgres -d logto < scripts/setup-admin-logto.sql
```

脚本幂等, 可重复执行。第 4 步会把角色分配给 default tenant 全部用户 (dev 便利),
生产环境请改为只插具体管理员 user_id。

## 给新用户提权

```sql
INSERT INTO users_roles (tenant_id, id, user_id, role_id)
SELECT 'default', 'defadmur' || u.id, u.id, r.id
FROM users u, roles r
WHERE u.id = '<logto-user-id>' AND r.tenant_id='default' AND r.name='default:admin';
```

或在 Logto Console 中给用户分配 `default:admin` 角色。
