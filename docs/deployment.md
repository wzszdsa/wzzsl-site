# 部署手册

面向一台全新的阿里云 ECS（境外地域，免备案）。按「服务器初始化 → 首次部署 →
日常发布」三段组织，可照做执行。

## 零、前置条件

| 项目 | 要求 |
|---|---|
| 服务器 | 阿里云 ECS，境外地域；建议 2 核 4G 起（Next.js 构建吃内存） |
| 系统 | Ubuntu 22.04 / 24.04（本文以 Ubuntu 为例） |
| 本地 | Node 20+、npm、rsync、ssh |
| DNS | 已按 [dns.md](dns.md) 配好 `@` 与 `*` 记录 |

> **内存提示**：`petcare` 的 `next build` 在小内存机器上容易 OOM。本文的方案是
> **本地构建后上传**，服务器只跑产物，因此 2G 内存也够用。若改为服务器上构建，
> 需 4G 以上并配置 swap。

---

## 一、服务器初始化（仅一次）

### 1.1 创建运行用户与目录

```bash
sudo useradd -r -m -d /srv/wzzsl -s /bin/bash wzzsl
sudo mkdir -p /srv/wzzsl/{portal,todo,box,demo,days,yijian,yijian-api,petcare}
sudo chown -R wzzsl:wzzsl /srv/wzzsl
```

### 1.2 安装基础软件

```bash
sudo apt update
sudo apt install -y nginx mysql-server postgresql postgresql-contrib rsync curl

# Node 20（NodeSource）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # 应输出 v20.x
```

### 1.3 配置 SSH 免密（在本地执行）

```bash
ssh-keygen -t ed25519 -C "wzzsl-deploy"      # 若已有密钥可跳过
ssh-copy-id wzzsl@<ECS_IP>
ssh wzzsl@<ECS_IP> 'echo 免密登录成功'
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

### 1.4 初始化数据库

**MySQL（驿见快递）**

```bash
sudo mysql <<'EOF'
CREATE DATABASE yijian CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'yijian'@'127.0.0.1' IDENTIFIED BY '<强密码>';
GRANT ALL PRIVILEGES ON yijian.* TO 'yijian'@'127.0.0.1';
FLUSH PRIVILEGES;
EOF

# 建表（脚本要求先选中数据库）
sudo mysql yijian < /srv/wzzsl/yijian-api/mysql/schema.sql
```

**PostgreSQL（宠物预约）**

```bash
sudo -u postgres psql <<'EOF'
CREATE USER petcare WITH PASSWORD '<强密码>';
CREATE DATABASE petcare OWNER petcare;
EOF

# 迁移脚本位于 sites/pet-care/supabase/migrations/，需上传后执行
# psql "postgresql://petcare:<密码>@127.0.0.1:5432/petcare" -f <迁移文件>
```

### 1.5 签发泛域名证书

见 [dns.md](dns.md) 的「证书校验记录的处理」，使用阿里云 DNS 插件方式。

```bash
sudo certbot certonly --authenticator dns-aliyun \
  --dns-aliyun-credentials /etc/letsencrypt/aliyun.ini \
  -d wzzsl.fun -d '*.wzzsl.fun' --agree-tos -m <你的邮箱>
```

### 1.6 安装 Nginx 配置

```bash
sudo cp /srv/wzzsl/deploy/nginx/wzzsl.fun.conf /etc/nginx/conf.d/
sudo rm -f /etc/nginx/sites-enabled/default    # 移除默认站点
sudo nginx -t && sudo systemctl reload nginx
```

### 1.7 安装 systemd 服务

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

### 2.2 配置部署参数

```bash
cp deploy/.env.deploy.example deploy/.env.deploy
# 编辑填入 SERVER_HOST（ECS 公网 IP）等
```

### 2.3 先预览再上传

```bash
bash deploy/scripts/upload.sh --dry-run     # 只列出将要同步的文件
bash deploy/scripts/upload.sh               # 实际执行
```

### 2.4 配置两个服务端的密钥文件

上传后，在服务器上创建环境变量文件（**不要提交到仓库**）：

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
```

### 2.5 启动服务并验证

```bash
sudo systemctl restart yijian-api petcare
sudo systemctl status yijian-api --no-pager
sudo systemctl status petcare    --no-pager

# 逐项验证
curl -sS https://wzzsl.fun/ | head -5
curl -sS https://todo.wzzsl.fun/ | head -5
curl -sS https://yijian.wzzsl.fun/healthz
curl -sS -o /dev/null -w '%{http_code}\n' https://petcare.wzzsl.fun/
```

`/healthz` 是适配层内置的健康检查端点，返回已注册的路由数，用于确认
9 个函数都成功加载：

```json
{"ok":true,"routes":9}
```

---

## 三、日常发布

```bash
# 1. 拉取最新代码（含子项目更新）
git pull

# 2. 重新构建需要更新的站点
bash deploy/scripts/build-all.sh todo yijian

# 3. 上传
bash deploy/scripts/upload.sh todo yijian
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

| 现象 | 排查方向 |
|---|---|
| 站点 502 | Node 服务未启动或崩溃：`sudo journalctl -u yijian-api -n 50` |
| 接口 404 | 函数未打包成功：检查 `.build/yijian-api/functions/` 是否有 `.mjs`；`/healthz` 的路由数是否等于 9 |
| 接口 500 且日志含 Supabase | 环境变量里误设了 `SUPABASE_URL`，删掉它改用 `MYSQL_URL` |
| 子域打不开但主域正常 | DNS 的 `*` 通配记录未生效，用 `dig todo.wzzsl.fun @223.5.5.5` 确认 |
| 证书告警 | `sudo certbot renew --dry-run` 验证自动续期是否正常 |
| 刷新子路由 404 | 该站点缺少 SPA 回退规则，检查 Nginx 中对应 `location /` 的 `try_files` |
| Next.js 构建 OOM | 本地构建即可；若必须在服务器构建，需加 swap 或升配 |

### 查看日志

```bash
sudo journalctl -u yijian-api -f      # 驿见 API
sudo journalctl -u petcare    -f      # 宠物预约
sudo tail -f /var/log/nginx/error.log # Nginx
```
