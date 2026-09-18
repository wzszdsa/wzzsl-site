# 部署手册

面向阿里云 ECS，**Alibaba Cloud Linux 4 LTS**（RHEL 系，`dnf`，SELinux 默认启用），
境外地域（免 ICP 备案）。按「服务器初始化 → 首次部署 → 日常发布」三段组织。

- 实例 ID：`i-j6c06mdtwtzobo4vaxc`
- 公网 IP：`47.76.244.209`

> **与 Ubuntu/Debian 的差异**（本文已按 Alibaba Cloud Linux 适配，差异点集中在三处）：
> 1. 包管理器是 `dnf` 而非 `apt`，软件名也不同（`mysql-server`、`postgresql-server`）；
> 2. **SELinux 默认启用** —— 不放行策略会导致 Nginx 反代返回 502、静态文件返回 403；
> 3. **firewalld 默认启用** —— 不开放端口则外部完全无法访问。
>
> 三处若遗漏，现象都具有误导性（看似配置正确却不通），因此本文将其列为独立步骤。

---

## 零、前置条件

| 项目 | 要求 |
|---|---|
| 服务器 | 阿里云 ECS，境外地域 |
| 系统 | Alibaba Cloud Linux 4 LTS |
| 本地 | Node 20+、npm、rsync、ssh |
| DNS | 已按 [dns.md](dns.md) 配好 `@` 与 `*` 记录 |

> **内存提示**：本方案是**本地构建后上传**，服务器只跑产物、不跑构建，
> 因此 `next build` 的内存压力留在本地，服务器 2G 内存即可。

---

## 一、服务器初始化（仅一次）

### 1.1 登录并创建运行用户

Alibaba Cloud Linux 镜像的初始登录用户为 `root` 或 `ecs-user`（以控制台设置为准）。
以下命令以 `root` 或 `sudo` 执行：

```bash
# 创建专用运行用户（不用于登录，仅用于跑服务）
sudo useradd -r -m -d /srv/wzzsl -s /bin/bash wzzsl

sudo mkdir -p /srv/wzzsl/{portal,todo,box,demo,days,yijian,yijian-api,petcare}
sudo chown -R wzzsl:wzzsl /srv/wzzsl
```

### 1.2 开放端口（firewalld）

```bash
sudo systemctl enable --now firewalld
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
sudo firewall-cmd --list-all      # 确认 http/https 已在 services 中
```

> 阿里云**安全组**也需放行 80/443 —— firewalld 与安全组是两道独立的关卡，
> 只放行其中之一仍然不通。

### 1.3 安装基础软件

```bash
sudo dnf update -y
sudo dnf install -y nginx mysql-server postgresql-server postgresql-contrib rsync curl

# Node 20（NodeSource 的 RPM 源）
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
node -v      # 应输出 v20.x
```

### 1.4 SELinux 放行（关键，跳过会导致 502/403）

Alibaba Cloud Linux 默认 SELinux 为 enforcing。两件事必须做：

```bash
# (1) 允许 Nginx 发起反向代理连接（否则 yijian / petcare 一律 502）
sudo setsebool -P httpd_can_network_connect 1

# (2) 让 Nginx 能读取静态站点文件（否则 portal/todo/box/demo/days/yijian 一律 403）
sudo dnf install -y policycoreutils-python-utils
sudo semanage fcontext -a -t httpd_sys_content_t \
  "/srv/wzzsl/(portal|todo|box|demo|days|yijian)(/.*)?"
sudo restorecon -Rv /srv/wzzsl/portal /srv/wzzsl/todo  /srv/wzzsl/box \
                   /srv/wzzsl/demo   /srv/wzzsl/days  /srv/wzzsl/yijian
```

**为什么只标注这六个目录**：`yijian-api` 与 `petcare` 是 Node 常驻进程的代码与依赖目录，
不经由 Nginx 读取，因此保持默认上下文即可 —— 把 `httpd_sys_content_t` 套到
`node_modules` 上并无必要，反而可能干扰原生模块加载。

**验证**：

```bash
getenforce                                  # 应输出 Enforcing
getsebool httpd_can_network_connect         # 应为 on
ls -Z /srv/wzzsl/portal                     # 上下文应为 httpd_sys_content_t
```

> 不建议直接 `setenforce 0` 关闭 SELinux 绕过问题 —— 那只是把故障推迟到重启后。
> 若出现 403/502 且不确定原因，用 `sudo ausearch -m avc -ts recent` 看具体拦截记录。

### 1.5 配置 SSH 免密（在本地执行）

```bash
ssh-keygen -t ed25519 -C "wzzsl-deploy"      # 若已有密钥可跳过
ssh-copy-id <初始用户>@47.76.244.209
ssh <初始用户>@47.76.244.209 'echo 免密登录成功'
```

授予 `wzzsl` 重启服务的权限，避免每次输入 sudo 密码：

```bash
sudo tee /etc/sudoers.d/wzzsl >/dev/null <<'EOF'
wzzsl ALL=(ALL) NOPASSWD: /bin/systemctl restart yijian-api, \
                          /bin/systemctl restart petcare, \
                          /usr/sbin/nginx, /bin/systemctl reload nginx, \
                          /bin/cp
EOF
sudo chmod 440 /etc/sudoers.d/wzzsl
```

### 1.6 初始化数据库

**MySQL（驿见快递）**

```bash
sudo systemctl enable --now mysqld

# MySQL 8 首次安装后 root 可能是临时密码，见 /var/log/mysqld.log；
# 也可能允许本地 root 免密登录。先试：
sudo mysql -u root -e "SELECT VERSION();"

sudo mysql -u root <<'EOF'
CREATE DATABASE yijian CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'yijian'@'127.0.0.1' IDENTIFIED BY '<强密码>';
GRANT ALL PRIVILEGES ON yijian.* TO 'yijian'@'127.0.0.1';
FLUSH PRIVILEGES;
EOF

# 建表（脚本要求先选中数据库）
sudo mysql -u root yijian < /srv/wzzsl/yijian-api/mysql/schema.sql
```

**PostgreSQL（宠物预约）**

RHEL 系需先初始化数据目录（Ubuntu 的包会自动做，这里不会）：

```bash
sudo dnf install -y postgresql-server
sudo postgresql-setup --initdb
sudo systemctl enable --now postgresql

sudo -u postgres psql <<'EOF'
CREATE USER petcare WITH PASSWORD '<强密码>';
CREATE DATABASE petcare OWNER petcare;
EOF

# 迁移脚本位于 sites/pet-care/supabase/migrations/，上传后执行
# psql "postgresql://petcare:<密码>@127.0.0.1:5432/petcare" -f <迁移文件>
```

### 1.7 签发泛域名证书

见 [dns.md](dns.md) 的「证书校验记录的处理」。注意阿里云的 DNS 插件**不在 dnf 源中**，
需通过 pip 安装：

```bash
sudo dnf install -y certbot python3-pip
sudo pip3 install certbot-dns-aliyun

# 配置阿里云 AccessKey（仅需 AliyunDNSFullAccess 权限）
sudo tee /etc/letsencrypt/aliyun.ini >/dev/null <<'EOF'
dns_aliyun_access_key = <AccessKeyId>
dns_aliyun_access_key_secret = <AccessKeySecret>
EOF
sudo chmod 600 /etc/letsencrypt/aliyun.ini

sudo certbot certonly --authenticator dns-aliyun \
  --dns-aliyun-credentials /etc/letsencrypt/aliyun.ini \
  -d wzzsl.fun -d '*.wzzsl.fun' --agree-tos -m <你的邮箱>
```

若 pip 安装的插件无法被 certbot 识别，改用 certbot 的 snap 版本，或参考
[阿里云官方文档](https://help.aliyun.com/zh/ssl-certificate/)的证书自动续期方案。

### 1.8 安装 Nginx 配置

```bash
sudo cp /srv/wzzsl/deploy/nginx/wzzsl.fun.conf /etc/nginx/conf.d/
sudo nginx -t && sudo systemctl enable --now nginx
```

> RHEL 系的 `nginx.conf` 默认已包含 `conf.d/*.conf`，因此无需像 Ubuntu 那样
> 处理 `sites-enabled/default`。用 `nginx -T | grep wzzsl` 确认配置已加载。

### 1.9 安装 systemd 服务

```bash
sudo cp /srv/wzzsl/yijian-api/yijian-api.service /etc/systemd/system/
sudo cp /srv/wzzsl/petcare/petcare.service       /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable yijian-api petcare
```

---

## 二、首次部署

### 2.1 本地构建

```bash
bash deploy/scripts/build-all.sh
```

产物落在 `.build/`，与服务器上的目录名一一对应。

### 2.2 上传

`deploy/.env.deploy` 已填好 IP 与用户名，直接执行：

```bash
bash deploy/scripts/upload.sh --dry-run     # 先预览将要同步的文件
bash deploy/scripts/upload.sh               # 实际执行
```

### 2.3 配置两个服务的环境变量

上传后，在服务器上创建（**不要提交到仓库**）：

```bash
sudo -u wzzsl tee /srv/wzzsl/yijian-api/.env >/dev/null <<'EOF'
NODE_ENV=production
MYSQL_URL=mysql://yijian:<密码>@127.0.0.1:3306/yijian
SESSION_SECRET=<随机字符串>
KUAIDI100_KEY=<快递100 的 key>
# 注意：不要设置 SUPABASE_URL —— 本项目已移除 Supabase
EOF

sudo -u wzzsl tee /srv/wzzsl/petcare/.env >/dev/null <<'EOF'
NODE_ENV=production
DATABASE_URL=postgresql://petcare:<密码>@127.0.0.1:5432/petcare
OPENAI_API_KEY=<如需图片生成>
EOF

sudo chmod 600 /srv/wzzsl/yijian-api/.env /srv/wzzsl/petcare/.env
sudo chown wzzsl:wzzsl /srv/wzzsl/yijian-api/.env /srv/wzzsl/petcare/.env
```

### 2.4 启动并验证

```bash
sudo systemctl restart yijian-api petcare
sudo systemctl status yijian-api --no-pager
sudo systemctl status petcare    --no-pager

# 先在服务器本机验证（排除 DNS 与证书因素）
curl -sS http://127.0.0.1:3101/healthz
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3102/

# 再验证域名
curl -sS https://wzzsl.fun/ | head -5
curl -sS https://yijian.wzzsl.fun/healthz
curl -sS -o /dev/null -w '%{http_code}\n' https://petcare.wzzsl.fun/
```

`/healthz` 是适配层内置的健康检查端点，返回已注册的路由数：

```json
{"ok":true,"routes":9}
```

---

## 三、日常发布

```bash
git pull                                          # 拉取最新代码
bash deploy/scripts/build-all.sh todo yijian      # 重新构建需要更新的站点
bash deploy/scripts/upload.sh todo yijian         # 上传
```

上传脚本会自动重启对应的 Node 服务。纯静态站点无需重启，Nginx 直接读新文件。

### 拉取子项目的上游更新

```bash
git subtree pull --prefix=sites/todo_list https://github.com/wzszdsa/todo_list.git main
```

### 回滚

产物目录由 rsync `--delete` 保持与本地一致，因此回滚即「用旧版本重新构建并上传」：

```bash
git log --oneline -- sites/todo_list     # 找到目标提交
git checkout <commit> -- sites/todo_list
bash deploy/scripts/build-all.sh todo && bash deploy/scripts/upload.sh todo
git checkout main -- sites/todo_list     # 恢复
```

---

## 四、故障排查

Alibaba Cloud Linux 上 SELinux 与 firewalld 会引入一批「配置看着没错却不通」的现象，
下表按可能性排序：

| 现象 | 排查方向 |
|---|---|
| 静态站点 **403** | SELinux 未放行文件读取：`sudo restorecon -Rv /srv/wzzsl`；确认 `ls -Z` 上下文为 `httpd_sys_content_t` |
| 反代站点 **502** | SELinux 未放行网络连接：`sudo setsebool -P httpd_can_network_connect 1` |
| 全站超时、curl 不通 | firewalld 或**阿里云安全组**未放行 80/443（两者独立，都要开） |
| 站点 502 但本机 curl 正常 | Node 服务未启动或崩溃：`sudo journalctl -u yijian-api -n 50` |
| 接口 404 | 函数未打包：检查 `.build/yijian-api/functions/` 是否有 `.mjs`；`/healthz` 路由数是否为 9 |
| 接口 500 且日志含 Supabase | 环境变量误设了 `SUPABASE_URL`，删掉改用 `MYSQL_URL` |
| 子域打不开但主域正常 | DNS 的 `*` 通配记录未生效：`dig todo.wzzsl.fun @223.5.5.5` |
| 刷新子路由 404 | 该站点缺少 SPA 回退，检查对应 `location /` 的 `try_files` |
| 证书告警 | `sudo certbot renew --dry-run` 验证自动续期 |

### 查看日志

```bash
sudo journalctl -u yijian-api -f          # 驿见 API
sudo journalctl -u petcare    -f          # 宠物预约
sudo tail -f /var/log/nginx/error.log     # Nginx
sudo ausearch -m avc -ts recent           # SELinux 拒绝记录（排查 403/502 时最有用）
```

`ausearch` 能看到 SELinux 具体拦截了什么 —— 比反复猜测 `restorecon` 有效得多。
