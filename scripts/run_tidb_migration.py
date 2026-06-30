#!/usr/bin/env python3
"""
PhishSimAI HQ Backend Database Migration Runner
Executes SQL migrations against TiDB Cloud
"""

import sys
import os

try:
    from tidbcloud.serverless import connect
except ImportError:
    print("❌ Error: tidbcloud.serverless not installed")
    print("   Run: pip install tidbcloud-serverless")
    sys.exit(1)

async def run_migrations():
    """Execute HQ backend table migrations"""
    
    db_url = os.environ.get('DATABASE_URL')
    if not db_url:
        print("❌ DATABASE_URL environment variable not set")
        sys.exit(1)
    
    print("🔗 Connecting to TiDB...")
    conn = await connect({'url': db_url})
    
    migrations = [
        # Agent Status Table
        """
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """,
        
        # Agent Memory Table
        """
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """,
        
        # Agent Tasks Table
        """
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """,
        
        # Agent Chat History Table
        """
        CREATE TABLE IF NOT EXISTS agent_chats (
          id VARCHAR(36) PRIMARY KEY DEFAULT UUID(),
          agent_name VARCHAR(50),
          message TEXT,
          response TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_agent (agent_name),
          INDEX idx_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """,
        
        # Completion Reports Table
        """
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    ]
    
    print(f"📝 Running {len(migrations)} migrations...\n")
    
    for i, sql in enumerate(migrations, 1):
        table_name = sql.split('CREATE TABLE IF NOT EXISTS')[1].split('(')[0].strip()
        try:
            result = await conn.execute(sql)
            print(f"  ✅ {i}. {table_name:25s} created/updated")
        except Exception as e:
            print(f"  ⚠️  {i}. {table_name:25s} - {str(e)[:60]}")
    
    print("\n✅ Migrations complete")
    await conn.close()

if __name__ == '__main__':
    import asyncio
    asyncio.run(run_migrations())
