#!/bin/bash
# PhishSimAI HQ Backend — Direct MySQL Migration

if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL not set"
    exit 1
fi

# Parse DATABASE_URL: mysql://user:password@host:4000/database
DB_USER=$(echo $DATABASE_URL | sed -E 's|mysql://([^:]+):.*|\1|')
DB_PASS=$(echo $DATABASE_URL | sed -E 's|mysql://[^:]+:([^@]+)@.*|\1|')
DB_HOST=$(echo $DATABASE_URL | sed -E 's|.*@([^:]+):.*|\1|')
DB_PORT=$(echo $DATABASE_URL | sed -E 's|.*:([0-9]+)/.*|\1|')
DB_NAME=$(echo $DATABASE_URL | sed -E 's|.*@[^/]+/(.+)$|\1|')

echo "🔗 Connecting to TiDB: $DB_HOST:$DB_PORT"
echo ""

mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" << 'SQL'
CREATE TABLE IF NOT EXISTS agent_status (
  id VARCHAR(36) PRIMARY KEY DEFAULT UUID(),
  name VARCHAR(50) NOT NULL UNIQUE,
  title VARCHAR(100),
  status VARCHAR(20) DEFAULT 'unknown',
  uptime_pct FLOAT DEFAULT 0,
  health_score INT DEFAULT 0,
  last_ping TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  memory_usage INT DEFAULT 0,
  task_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_memory (
  id VARCHAR(36) PRIMARY KEY DEFAULT UUID(),
  agent_id VARCHAR(50) NOT NULL,
  `key` VARCHAR(255) NOT NULL,
  value LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_agent_key (agent_id, `key`),
  INDEX idx_agent (agent_id),
  INDEX idx_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_tasks (
  id VARCHAR(36) PRIMARY KEY DEFAULT UUID(),
  agent_id VARCHAR(50),
  description TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  priority INT DEFAULT 0,
  result LONGTEXT,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  INDEX idx_status (status),
  INDEX idx_agent (agent_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_chats (
  id VARCHAR(36) PRIMARY KEY DEFAULT UUID(),
  agent_name VARCHAR(50),
  message TEXT,
  response TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_agent (agent_name),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS completion_reports (
  id VARCHAR(36) PRIMARY KEY DEFAULT UUID(),
  task_id VARCHAR(36),
  agent_id VARCHAR(50),
  status VARCHAR(20),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  qwen_output LONGTEXT,
  files_changed JSON,
  commit_sha VARCHAR(40),
  error TEXT,
  INDEX idx_task (task_id),
  INDEX idx_agent (agent_id),
  INDEX idx_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SQL

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ All tables created successfully"
else
    echo ""
    echo "⚠️  Migration encountered issues (tables may already exist)"
fi
