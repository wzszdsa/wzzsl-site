# DNS 记录

域名 `wzzsl.fun` 的 DNS 托管在**阿里云（万网）**，名称服务器为
`dns29.hichina.com` / `dns30.hichina.com`。配置入口：阿里云控制台 → 云解析 DNS。

## 需要配置的记录

假设 ECS 公网 IP 为 `<ECS_IP>`（部署时替换为实际值）。

| 主机记录 | 类型 | 记录值 | TTL | 用途 |
|---|---|---|---|---|
| `@` | A | `<ECS_IP>` | 600 | 门户 `wzzsl.fun` |
| `*` | A | `<ECS_IP>` | 600 | 全部子域（通配） |
| `_acme-challenge` | TXT | 由 certbot 自动维护 | 600 | 泛域名证书校验 |

**为什么用通配记录**：本站有 7 个子域，且未来还会增加。一条 `*` 记录即可覆盖
全部子域，新增站点时无需再改 DNS。

**为什么不建议逐条 CNAME**：如果每个子域单独配 CNAME，新增站点就要同步改 DNS，
容易遗漏；且 CNAME 与后续可能用到的其他记录类型会冲突。

## 证书校验记录的处理

`*.wzzsl.fun` 泛域名证书只能用 **DNS-01** 方式校验（HTTP-01 不支持通配符）。
certbot 需要临时创建 `_acme-challenge.wzzsl.fun` 的 TXT 记录。

有两种做法：

**方案 A：阿里云 DNS 插件（推荐，全自动续期）**

```bash
# 安装插件
sudo apt install python3-certbot-dns-aliyun

# 配置阿里云 AccessKey（仅需 AliyunDNSFullAccess 权限）
sudo tee /etc/letsencrypt/aliyun.ini >/dev/null <<'EOF'
dns_aliyun_access_key = <AccessKeyId>
dns_aliyun_access_key_secret = <AccessKeySecret>
EOF
sudo chmod 600 /etc/letsencrypt/aliyun.ini

# 首次签发
sudo certbot certonly \
  --authenticator dns-aliyun \
  --dns-aliyun-credentials /etc/letsencrypt/aliyun.ini \
  -d wzzsl.fun -d '*.wzzsl.fun' \
  --agree-tos -m <你的邮箱>
```

certbot 会自动创建并清理 TXT 记录，续期也无需人工介入。

**方案 B：手动添加 TXT**

若不便使用插件，可在 certbot 提示时手动到阿里云控制台添加对应的 TXT 记录，
校验通过后再删除。缺点是需要人工参与，且 90 天续期时需重复操作。

## 备案说明

**当前无需备案。** ECS 位于阿里云境外地域，且域名解析指向境外 IP，
不涉及中国大陆的 ICP 备案要求。

需要留意的是：**如果将来把服务器迁到阿里云中国大陆地域，必须先完成 ICP 备案**，
否则 80/443 端口的对外 Web 服务会被阻断。

好消息是 `.fun` 后缀**支持备案** —— 2017 年 10 月 11 日通过工信部资质审批，
已列入可备案顶级域名单（阿里云万网 `.fun` 页面明确标注「支持备案」）。
因此若将来需要迁回大陆，备案路径是通的，只是需要预留 1–3 周的审核时间。

## 验证方法

配置完成后，可在本地验证解析是否生效：

```bash
# 应返回 ECS 公网 IP
dig +short wzzsl.fun
dig +short todo.wzzsl.fun
dig +short petcare.wzzsl.fun

# 验证证书覆盖范围
echo | openssl s_client -connect yijian.wzzsl.fun:443 -servername yijian.wzzsl.fun 2>/dev/null \
  | openssl x509 -noout -subject -ext subjectAltName
```

> **注意**：如果本机开启了代理工具（Clash 等）并使用 fake-ip 模式，
> `dig` 会返回 `198.18.x.x` 这类保留地址而非真实 IP。验证 DNS 时请先关闭代理，
> 或改用 `dig @223.5.5.5 wzzsl.fun`（阿里公共 DNS）直接查询。
