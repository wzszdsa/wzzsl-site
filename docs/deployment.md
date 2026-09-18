# 部署手册

目标主机：阿里云 ECS `47.76.244.209`（实例 `i-j6c06mdtwtzobo4vaxc`），
**Alibaba Cloud Linux 4 LTS**（RHEL 系，`dnf`，SELinux 默认启用），境外地域（免备案）。

> 本文与「从零开始」的部署手册不同 —— 这台服务器**已在运行**，因此先盘点现状，
> 再按依赖顺序列出待完成步骤。直接照搬空白服务器的初始化流程会覆盖现有配置。

---

## 一、现状盘点（2026-09-18 实测）

| 项目 | 状态 | 说明 |
|---|---|---|
| 系统 | ✅ Alibaba Cloud Linux 4 | 内核 6.6.102，x86_64 |
| 规格 | ⚠️ 2 核 / **1.6 GB 内存** | 另有 4 GB swap；可用约 1.1 GB |
| Nginx | ✅ 1.30.4 已运行 | 配置在 `/etc/nginx/conf.d/yijian.conf` |
| acme.sh | ✅ 已装并自动续期 | `/root/.acme.sh/`，crontab 每日 4 次 |
| 证书 | ⚠️ SAN **仅含 `wzzsl.fun`** | 不含子域，子域 TLS 握手会失败 |
| MariaDB | ✅ 10.6.25 已运行 | 端口 **53306**（非默认 3306），库 `yijian` |
| `yijian.service` | ✅ 已运行 24h+ | `/opt/yijian/server-dist/index.mjs`，端口 **3000** |
| PostgreSQL | ✅ 15.18 本次新装 | 已调优，库 `petcare` 与表 `appointments` 已建 |
| `/srv/wzzsl/` | ✅ 本次新建 | 7 个站点目录已就绪 |
| SELinux | ⚠️ 待确认放行 | 见第四节 |
| firewalld | ⚠️ 待确认放行 | 另需确认阿里云安全组 |

**内存基线**（实测）：mariadbd 96 MB、node 130 MB、postgres 26 MB、nginx 7 MB，
合计约 260 MB，剩余约 1.1 GB 可供 pet-care 使用。

**已有的自动化**（勿破坏）：
- root crontab：acme.sh 续期（`47 0,6,12,18 * * *`）
- root crontab：`/usr/local/bin/yijian-backup.sh`（每日 3:30 备份 `yijian` 库到 `/var/backups/yijian`，保留 14 天）

---

## 二、待完成步骤（按依赖顺序）

### 步骤 1：添加 DNS 记录 ← **当前阻塞项**

在阿里云云解析添加通配记录：

| 主机记录 | 类型 | 记录值 | TTL |
|---|---|---|---|
| `*` | A | `47.76.244.209` | 600 |

`@` 记录已存在。**后续所有步骤都依赖这一步** —— HTTP-01 证书校验要求子域能解析到本机。

验证（从服务器侧，本机 DNS 被代理劫持不可用）：

```bash
ssh root@47.76.244.209 'for h in todo.wzzsl.fun petcare.wzzsl.fun; do
  printf "%-24s " "$h"; getent hosts "$h" | awk "{print \$1}"; done'
```

### 步骤 2：签发覆盖子域的证书

现有证书只有 apex，子域需一并纳入。因所有子域都指向同一台机器，
用 **HTTP-01 多 SAN** 方式即可，**无需阿里云 AccessKey**：

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

沿用现有文件路径，续期机制不变。详见 [dns.md](dns.md)。

### 步骤 3：安装 Nginx 配置

新配置把根域改为门户、驿见迁至子域（**服务本身不动**，仍监听 3000）：

```bash
cp /srv/wzzsl/deploy/nginx/wzzsl.fun.conf /etc/nginx/conf.d/
rm -f /etc/nginx/conf.d/yijian.conf        # 旧配置仅含根域，已被取代
nginx -t && systemctl reload nginx
```

> 执行前先备份：`cp /etc/nginx/conf.d/yijian.conf /root/yijian.conf.bak`

### 步骤 4：SELinux 与 firewalld 放行

```bash
# 允许 Nginx 反代（否则 yijian / petcare 一律 502）
setsebool -P httpd_can_network_connect 1

# 让 Nginx 能读静态站点文件（否则静态站一律 403）
dnf install -y policycoreutils-python-utils
semanage fcontext -a -t httpd_sys_content_t \
  "/srv/wzzsl/(portal|todo|box|demo|days|yijian)(/.*)?"
restorecon -Rv /srv/wzzsl/portal /srv/wzzsl/todo  /srv/wzzsl/box \
                /srv/wzzsl/demo   /srv/wzzsl/days  /srv/wzzsl/yijian

# 防火墙
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
firewall-cmd --reload
```

`yijian-api` 与 `petcare` 的目录**不做标注** —— 它们是 Node 服务的代码与依赖，
不经 Nginx 读取，标注反而可能干扰原生模块加载。

### 步骤 5：上传静态站点

本地执行：

```bash
bash deploy/scripts/build-all.sh portal todo box demo days yijian
bash deploy/scripts/upload.sh    portal todo box demo days yijian
```

`deploy/.env.deploy` 已填好 IP 与用户名（`SERVER_USER=wzzsl`，
若尚未创建该用户则先改为 `root`）。

### 步骤 6：部署 pet-care

```bash
bash deploy/scripts/build-all.sh petcare
bash deploy/scripts/upload.sh    petcare
```

然后在服务器上创建环境文件并启动：

```bash
tee /srv/wzzsl/petcare/.env >/dev/null <<'EOF'
NODE_ENV=production
DATABASE_URL=postgresql://petcare:K1WfkArblUroDkff0Gk1XQhd@127.0.0.1:5432/petcare
# 限制堆内存，避免在 1.6 GB 机器上与其他服务争抢
NODE_OPTIONS=--max-old-space-size=320
EOF
chmod 600 /srv/wzzsl/petcare/.env

cp /srv/wzzsl/petcare/petcare.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now petcare
systemctl status petcare --no-pager
```

### 步骤 7：验证

```bash
# 先在服务器本机验证（排除 DNS 与证书因素）
curl -sS -o /dev/null -w 'portal   %{http_code}\n' http://127.0.0.1/ -H 'Host: wzzsl.fun'
curl -sS -o /dev/null -w 'petcare  %{http_code}\n' http://127.0.0.1:3102/
curl -sS http://127.0.0.1:3000/api/parcels    # 应返回 401 AUTH_REQUIRED

# 再验证域名
for h in wzzsl.fun todo.wzzsl.fun box.wzzsl.fun demo.wzzsl.fun \
         days.wzzsl.fun yijian.wzzsl.fun petcare.wzzsl.fun; do
  printf '%-22s ' "$h"
  curl -sS -o /dev/null -w '%{http_code}\n' "https://$h/"
done
```

---

## 三、日常发布

```bash
git pull
bash deploy/scripts/build-all.sh todo yijian     # 重新构建需要更新的站点
bash deploy/scripts/upload.sh    todo yijian     # 上传（自动重启对应 Node 服务）
```

纯静态站点无需重启，Nginx 直接读新文件。

### 拉取子项目的上游更新

```bash
git subtree pull --prefix=sites/todo_list https://github.com/wzszdsa/todo_list.git main
```

### 回滚

产物由 rsync `--delete` 保持与本地一致，回滚即「用旧版本重新构建并上传」：

```bash
git log --oneline -- sites/todo_list
git checkout <commit> -- sites/todo_list
bash deploy/scripts/build-all.sh todo && bash deploy/scripts/upload.sh todo
git checkout main -- sites/todo_list
```

---

## 四、故障排查

Alibaba Cloud Linux 的 SELinux 与 firewalld 会引入一批「配置看着没错却不通」的现象，
下表按可能性排序：

| 现象 | 排查方向 |
|---|---|
| 静态站点 **403** | SELinux 未放行文件读取：`restorecon -Rv /srv/wzzsl/<site>`；`ls -Z` 确认上下文为 `httpd_sys_content_t` |
| 反代站点 **502** | SELinux 未放行网络连接：`setsebool -P httpd_can_network_connect 1` |
| 子域 **SSL error 35** | 证书 SAN 未包含该子域 —— 需重新签发（步骤 2） |
| 子域 DNS 无解析 | 通配记录未生效；**从服务器侧**用 `getent hosts` 验证，本机 DNS 被代理劫持 |
| 全站超时 | firewalld 或**阿里云安全组**未放行（两者独立，都要开） |
| 接口 500 且日志含 Supabase | 环境变量误设了 `SUPABASE_URL`，删掉改用 `MYSQL_URL` |
| 刷新子路由 404 | 该站点缺少 SPA 回退，检查对应 `location /` 的 `try_files` |
| pet-care 被 OOM Kill | `journalctl -k \| grep -i oom`；调低 `NODE_OPTIONS` 或给 ECS 升配 |

### 查看日志

```bash
journalctl -u yijian  -f                  # 驿见（既有服务）
journalctl -u petcare -f                  # 宠物预约
journalctl -u mariadb -f                  # MariaDB
journalctl -u postgresql -f               # PostgreSQL
tail -f /var/log/nginx/error.log          # Nginx
ausearch -m avc -ts recent                # SELinux 拒绝记录（排查 403/502 最有效）
```

`ausearch` 能看到 SELinux 具体拦截了什么，比反复猜测 `restorecon` 高效得多。
