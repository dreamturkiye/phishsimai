#!/bin/bash
# PhishSimAI HQ Backend — Direct MySQL Migration

set -e

if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL not set"
    echo ""
    echo "Example:"
    echo '  export DATABASE_URL="mysql://myuser:mypass@tidb.example.com:4000/mydb"'
    exit 1
fi

echo "🔗 Parsing connection string..."

# Remove mysql:// prefix
CONN_STR="${DATABASE_URL#mysql://}"

# Extract user and password
USER_PASS="${CONN_STR%%@*}"
DB_USER="${USER_PASS%%:*}"
DB_PASS="${USER_PASS#*:}"

# Extract host, port, and database
HOST_DB="${CONN_STR##*@}"
HOST_PORT="${HOST_DB%%/*}"
DB_NAME="${HOST_DB##*/}"

# Split host and port
DB_HOST="${HOST_PORT%%:*}"
DB_PORT="${HOST_PORT##*:}"

echo "   Host: $DB_HOST"
echo "   Port: $DB_PORT"
echo "   User: $DB_USER"
echo "   Database: $DB_NAME"
echo ""

echo "🚀 Running migrations..."
echo ""

mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" 2>&1 << 'SQL'
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

echo ""
echo "✅ All tables created successfully!"
echo ""
echo "📝 Seeding test agents..."
curl -s -X POST https://phishsimai.com/api/os/seed   -H "Content-Type: application/json"   -d '{"secret":"ps-hq-2026"}' | python3 -m json.tool

echo ""
echo "✅ Testing HQ endpoint..."
curl -s "https://phishsimai.com/api/os/hq?secret=ps-hq-2026" | python3 -m json.tool | head -25

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✅ PHISHSIMAI HQ BACKEND FULLY DEPLOYED!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Dashboard: https://phishsimai.com/hq"
echo ""
