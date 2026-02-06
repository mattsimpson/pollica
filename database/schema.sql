-- Database Schema for Pollica

CREATE DATABASE IF NOT EXISTS pollica;
USE pollica;

-- Users table (presenters only - audience members are anonymous)
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('presenter', 'admin') NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    token_version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sessions table for active question sessions
CREATE TABLE sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    presenter_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    join_code VARCHAR(4) UNIQUE,
    selected_question_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP NULL,
    FOREIGN KEY (presenter_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_presenter_id (presenter_id),
    INDEX idx_active (is_active),
    INDEX idx_join_code (join_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Questions table
CREATE TABLE questions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    presenter_id INT NOT NULL,
    question_text TEXT NOT NULL,
    question_type ENUM('multiple_choice', 'true_false', 'short_answer', 'numeric') NOT NULL,
    options JSON,
    correct_answer VARCHAR(255),
    time_limit INT, -- in seconds, NULL for no limit
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (presenter_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_session_id (session_id),
    INDEX idx_presenter_id (presenter_id),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Anonymous participants table for audience members
CREATE TABLE anonymous_participants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    anonymous_token VARCHAR(64) NOT NULL UNIQUE,
    display_name VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    INDEX idx_session_id (session_id),
    INDEX idx_anonymous_token (anonymous_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Anonymous responses table for responses from audience members
CREATE TABLE anonymous_responses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    question_id INT NOT NULL,
    anonymous_participant_id INT NOT NULL,
    answer_text TEXT NOT NULL,
    response_time INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    FOREIGN KEY (anonymous_participant_id) REFERENCES anonymous_participants(id) ON DELETE CASCADE,
    UNIQUE KEY unique_anonymous_response (question_id, anonymous_participant_id),
    INDEX idx_question_id (question_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add foreign key for selected_question_id after questions table is created
ALTER TABLE sessions ADD FOREIGN KEY (selected_question_id) REFERENCES questions(id) ON DELETE SET NULL;

-- Insert sample data for testing
INSERT INTO users (email, password_hash, role, first_name, last_name) VALUES
('admin@polli.ca', '$2b$10$9/OO/Jur3leUzuC8ubRnO.Ow4vSRE5NCol8fZ5xSqrqMlG06ZoqbG', 'admin', 'System', 'Admin'),
('presenter@polli.ca', '$2b$10$9/OO/Jur3leUzuC8ubRnO.Ow4vSRE5NCol8fZ5xSqrqMlG06ZoqbG', 'presenter', 'John', 'Smith');
-- Note: Password is hashed version of 'password123' (same for admin: admin123 -> using same hash for simplicity)
