# DNS 记录

域名 `wzzsl.fun` 的 DNS 托管在**阿里云（万网）**，名称服务器为
`dns29.hichina.com` / `dns30.hichina.com`。配置入口：阿里云控制台 → 云解析 DNS。

目标 ECS 公网 IP：`47.76.244.209`（实例 `i-j6c06mdtwtzobo4vaxc`，境外地域）。

## 当前解析状态（2026-09-18 实测）

| 域名 | 状态 |
|---|---|
| `wzzsl.fun` | ✅ 已解析到 `47.76.244.209` |
| `yijian` / `todo` / `box` / `demo` / `days` / `petcare` `.wzzsl.fun` | ❌ 全部无解析 |

## 需要补充的记录

| 主机记录 | 类型 | 记录值 | TTL | 用途 |
|---|---|---|---|---|
| `*` | A | `47.76.244.209` | 600 | 覆盖全部子域（通配） |

`@` 记录已存在，无需改动。

**为什么用通配而非逐条添加**：本站有 6 个子域且未来还会增加。一条 `*` 记录即可覆盖，
新增站点时不必再改 DNS，也避免遗漏。

> **通配记录的边界**：`*` 不覆盖裸域（apex），因此 `@` 记录必须单独存在 ——
> 这一点容易被忽略。另外通配记录也不会覆盖 `_acme-challenge` 之类的下划线前缀名。

## 证书策略

服务器上已有 acme.sh（`/root/.acme.sh/`）管理着 `wzzsl.fun` 的证书，
通过 **webroot（HTTP-01）** 方式校验，并由 root crontab 每天 4 次自动续期：

```
47 0,6,12,18 * * * "/root/.acme.sh"/acme.sh --cron --home "/root/.acme.sh" > /dev/null
```

现有证书的 SAN **只有 `wzzsl.fun`**，不覆盖子域，因此子域在 TLS 握手阶段即失败
（实测未知 SNI 返回 SSL error 35）。

### 方案 A：多 SAN 证书（推荐，无需任何凭据）

因为所有子域都解析到同一台服务器，可以直接用 **HTTP-01** 为每个域名签发到同一张证书里：

```bash
/root/.acme.sh/acme.sh --issue \
  -d wzzsl.fun \
  -d yijian.wzzsl.fun -d todo.wzzsl.fun -d box.wzzsl.fun \
  -d demo.wzzsl.fun   -d days.wzzsl.fun -d petcare.wzzsl.fun \
  --webroot /var/www/acme \
  --key-file       /etc/nginx/ssl/wzzsl.fun.key \
  --fullchain-file /etc/nginx/ssl/wzzsl.fun.fullchain.pem \
  --reloadcmd      "systemctl reload nginx"
```

**优点**：不需要阿里云 AccessKey，续期机制与现有完全一致，沿用同一套文件路径。

**代价**：新增子域时必须重新签发以追加 SAN。这是可接受的 —— 一条命令的事。

**另一个代价（已在实践中确认）**：多 SAN 证书**无法覆盖任意子域**，因此
访问未在证书中的子域（如打错字的 `random.wzzsl.fun`）会在 **TLS 握手阶段就失败**
（实测 `curl` 返回 exit 60、HTTP 000），浏览器显示证书错误 —— 也就是说
Nginx 配置里的 `default_server` 兜底规则对这类请求**实际不会生效**，
因为它根本走不到 HTTP 层。

对个人站点而言影响有限（已知的七个域名全部正常），但需要知道这个边界。
若希望未知子域也落到门户页，应改用方案 B 的通配符证书。

**前置条件**：签发前所有子域必须已能解析到本机（HTTP-01 要求 ACME 服务器能访问
`http://<子域>/.well-known/acme-challenge/`）。因此**必须先加 DNS 记录**。

### 方案 B：通配符证书（需阿里云 AccessKey）

若希望一劳永逸（新增子域无需重签），可改用 DNS-01 签发 `*.wzzsl.fun`：

```bash
export Ali_Key="<AccessKeyId>"
export Ali_Secret="<AccessKeySecret>"

/root/.acme.sh/acme.sh --issue --dns dns_ali \
  -d wzzsl.fun -d '*.wzzsl.fun' \
  --key-file       /etc/nginx/ssl/wzzsl.fun.key \
  --fullchain-file /etc/nginx/ssl/wzzsl.fun.fullchain.pem \
  --reloadcmd      "systemctl reload nginx"
```

凭据会保存在 `/root/.acme.sh/account.conf`，续期时自动复用。
**代价**：需要提供具备 DNS 解析权限的 AccessKey。

> 注意通配符证书**不含裸域**，所以 `-d wzzsl.fun` 必须一并写上。

## 备案说明

**当前无需备案。** ECS 位于阿里云境外地域，域名解析指向境外 IP，
不涉及中国大陆的 ICP 备案要求。

需要留意：**若将来把服务器迁到阿里云中国大陆地域，必须先完成 ICP 备案**，
否则 80/443 端口的对外 Web 服务会被阻断。

`.fun` 后缀**支持备案** —— 2017 年 10 月 11 日通过工信部资质审批，
已列入可备案顶级域名单（阿里云万网 `.fun` 页面明确标注「支持备案」）。
因此若将来需要迁回大陆，备案路径是通的，只需预留 1–3 周审核时间。

## 验证方法

**务必从服务器侧验证** —— 本机若开启了代理工具（Clash 等）的 fake-ip 模式，
所有域名（包括不存在的）都会返回 `198.18.x.x` 保留地址，结论完全不可用：

```bash
# 从服务器侧解析（推荐）
ssh root@47.76.244.209 'for h in wzzsl.fun todo.wzzsl.fun petcare.wzzsl.fun; do
  printf "%-24s " "$h"; getent hosts "$h" | awk "{print \$1}"; done'

# 验证证书覆盖范围
ssh root@47.76.244.209 \
  "openssl x509 -in /etc/nginx/ssl/wzzsl.fun.fullchain.pem -noout -ext subjectAltName"
```

预期证书的 SAN 应包含 `wzzsl.fun` 与全部六个子域。
