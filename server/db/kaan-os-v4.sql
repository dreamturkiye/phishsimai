-- Kaan AI OS v4 Schema for PhishSimAI (TiDB/MySQL)

-- Agent Status Table
CREATE TABLE IF NOT EXISTS agent_status (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) UNIQUE NOT NULL,
  title VARCHAR(255),
  status VARCHAR(50) DEFAULT 'online',
  health_check_result VARCHAR(50) DEFAULT 'healthy',
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  personality TEXT,
  expertise TEXT,
  INDEX idx_name (name),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Agent Memory Table (persistent context)
CREATE TABLE IF NOT EXISTS agent_memory (
  id INT PRIMARY KEY AUTO_INCREMENT,
  agent_name VARCHAR(255) NOT NULL,
  memory_text LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_agent (agent_name),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Agent Tasks Table
CREATE TABLE IF NOT EXISTS agent_tasks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  task TEXT NOT NULL,
  assignee VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending',
  qwen_output LONGTEXT,
  files_changed TEXT,
  commit_sha VARCHAR(255),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_assignee (assignee),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Completions Table (task execution history)
CREATE TABLE IF NOT EXISTS completions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  task_id INT,
  status VARCHAR(50),
  result_text LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_task (task_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- HQ Session/Chat History
CREATE TABLE IF NOT EXISTS hq_sessions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  session_id VARCHAR(255) UNIQUE,
  user_message TEXT,
  agent_reply LONGTEXT,
  agent_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session (session_id),
  INDEX idx_agent (agent_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
