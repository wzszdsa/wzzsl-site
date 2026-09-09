-- 驿见认证数据的 MySQL 结构。
-- 请先在目标 MySQL 数据库中选择数据库，再执行本文件。
-- 所有时间按 UTC 写入；应用层通过 MYSQL_URL 连接。

CREATE TABLE IF NOT EXISTS yijian_users (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  email VARCHAR(320) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  password_hash VARCHAR(255) NULL,
  email_verified_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY yijian_users_email_uq (email),
  KEY yijian_users_created_idx (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS yijian_otp_challenges (
  email VARCHAR(320) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  purpose VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  code_hash VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  sent_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  window_started_at DATETIME(3) NOT NULL,
  sent_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  used_at DATETIME(3) NULL,
  PRIMARY KEY (email, purpose),
  KEY yijian_otp_expiry_idx (expires_at),
  CONSTRAINT yijian_otp_purpose_ck CHECK (purpose IN ('login', 'register')),
  CONSTRAINT yijian_otp_attempts_ck CHECK (attempts BETWEEN 0 AND 5),
  CONSTRAINT yijian_otp_sent_count_ck CHECK (sent_count BETWEEN 0 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS yijian_sessions (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (token_hash),
  KEY yijian_sessions_expiry_idx (expires_at),
  KEY yijian_sessions_user_idx (user_id),
  CONSTRAINT yijian_sessions_user_fk
    FOREIGN KEY (user_id) REFERENCES yijian_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
