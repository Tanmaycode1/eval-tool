"""Database module for storing evaluation versions"""
import sqlite3
import json
from datetime import datetime
from typing import Dict, Any, List, Optional
import os
import time

# Determine default DB path based on environment
def get_default_db_path():
    """Get default database path - works for both Docker and local"""
    # Check environment variable first
    db_path = os.getenv("DB_PATH", None)
    if db_path:
        # If environment variable starts with /app but we're not in Docker, fix it
        if db_path.startswith("/app") and not os.path.exists("/.dockerenv"):
            print(f"⚠️  DB_PATH={db_path} looks like Docker path but not in Docker")
            return "data/evaluation_history.db"
        return db_path
    
    # Check if running in Docker (check for .dockerenv file which is reliable)
    if os.path.exists("/.dockerenv"):
        return "/app/data/evaluation_history.db"
    
    # Local development - use relative path in project
    return "data/evaluation_history.db"

DB_PATH = get_default_db_path()
print(f"📁 Using database path: {DB_PATH}")

def _parse_rating(rating_value):
    """Parse rating from database - handles both old integer format and new JSON format"""
    if rating_value is None:
        return None
    if isinstance(rating_value, int):
        # Legacy integer format
        return {"overall": rating_value}
    if isinstance(rating_value, str):
        try:
            parsed = json.loads(rating_value)
            return parsed if isinstance(parsed, dict) else {"overall": parsed}
        except (json.JSONDecodeError, TypeError):
            # If it's not valid JSON, try to parse as int
            try:
                return {"overall": int(rating_value)}
            except (ValueError, TypeError):
                return None
    return rating_value

def get_connection():
    """Get a database connection with proper settings"""
    db_path = DB_PATH
    
    # Ensure the directory exists
    db_dir = os.path.dirname(os.path.abspath(db_path))
    
    # Only try to create directory if it doesn't exist and is writable
    if db_dir and db_dir != '.' and not os.path.exists(db_dir):
        try:
            os.makedirs(db_dir, exist_ok=True)
            print(f"Created database directory: {db_dir}")
        except (OSError, PermissionError) as e:
            print(f"Warning: Could not create directory {db_dir}: {e}")
            # Directory creation failed, but we can still try to connect
            # SQLite will use the current directory if the path doesn't work
    
    try:
        conn = sqlite3.connect(db_path, timeout=10.0)
        # Enable WAL mode for better concurrency
        conn.execute("PRAGMA journal_mode=WAL")
        return conn
    except Exception as e:
        print(f"Error connecting to database at {db_path}: {e}")
        # Last resort: try current directory
        fallback_path = "evaluation_history.db"
        print(f"Falling back to: {fallback_path}")
        conn = sqlite3.connect(fallback_path, timeout=10.0)
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

def init_db():
    """Initialize the database with required tables"""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS evaluation_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                version_id TEXT UNIQUE NOT NULL,
                event_id TEXT NOT NULL,
                model_provider TEXT NOT NULL,
                model_name TEXT NOT NULL,
                user_prompt TEXT NOT NULL,
                image_urls TEXT,
                assistant_response TEXT NOT NULL,
                rating TEXT,
                metadata TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Note: Rating column is now TEXT to store JSON. 
        # The _parse_rating() function handles both old integer and new JSON formats when reading.
        
        # Create indexes separately
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_event_id ON evaluation_versions(event_id)
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_version_id ON evaluation_versions(version_id)
        """)
        
        # Create table for chain versions
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS chain_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                version_id TEXT UNIQUE NOT NULL,
                trace_id TEXT NOT NULL,
                chain_name TEXT,
                chain_events TEXT NOT NULL,
                total_tokens_input INTEGER,
                total_tokens_output INTEGER,
                total_cost REAL,
                rating TEXT,
                metadata TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Note: Rating column is now TEXT to store JSON.
        # The _parse_rating() function handles both old integer and new JSON formats when reading.
        
        # Create indexes for chains
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_trace_id ON chain_versions(trace_id)
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_chain_version_id ON chain_versions(version_id)
        """)
        
        # Create settings table for API keys and configuration
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT UNIQUE NOT NULL,
                value TEXT,
                description TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create index for settings
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key)
        """)
        
        conn.commit()
    finally:
        conn.close()
    
    # Verify database file was created
    try:
        if os.path.exists(DB_PATH):
            file_size = os.path.getsize(DB_PATH)
            print(f"✅ Database initialized at {DB_PATH} (size: {file_size} bytes)")
        else:
            # Check if it was created in current directory as fallback
            if os.path.exists("evaluation_history.db"):
                file_size = os.path.getsize("evaluation_history.db")
                print(f"✅ Database initialized at evaluation_history.db (size: {file_size} bytes)")
            else:
                print(f"⚠️  Warning: Database file not found after initialization")
    except Exception as e:
        print(f"Note: Could not verify database file: {e}")

def save_version(
    version_id: str,
    event_id: str,
    model_provider: str,
    model_name: str,
    user_prompt: str,
    image_urls: List[str],
    assistant_response: Dict[str, Any],
    rating: Optional[Any] = None,  # Can be int (legacy) or dict (new JSON format)
    metadata: Optional[Dict[str, Any]] = None
) -> bool:
    """Save a new evaluation version with retry logic for locked database"""
    max_retries = 3
    retry_delay = 0.1
    
    for attempt in range(max_retries):
        conn = None
        try:
            conn = get_connection()
            cursor = conn.cursor()
            
            # Convert rating to JSON if it's a dict, or keep as is if None
            rating_json = None
            if rating is not None:
                if isinstance(rating, dict):
                    rating_json = json.dumps(rating)
                elif isinstance(rating, int):
                    # Legacy: convert int to JSON format
                    rating_json = json.dumps({"overall": rating})
                else:
                    rating_json = json.dumps(rating) if not isinstance(rating, str) else rating
            
            cursor.execute("""
                INSERT INTO evaluation_versions 
                (version_id, event_id, model_provider, model_name, user_prompt, 
                 image_urls, assistant_response, rating, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                version_id,
                event_id,
                model_provider,
                model_name,
                user_prompt,
                json.dumps(image_urls) if image_urls else None,
                json.dumps(assistant_response),
                rating_json,
                json.dumps(metadata) if metadata else None
            ))
            
            conn.commit()
            print(f"Saved version {version_id} for event {event_id}")
            return True
        except sqlite3.IntegrityError:
            if conn:
                conn.close()
            print(f"Version {version_id} already exists")
            return False
        except sqlite3.OperationalError as e:
            if conn:
                conn.close()
            if "database is locked" in str(e).lower() and attempt < max_retries - 1:
                print(f"Database locked, retrying ({attempt + 1}/{max_retries})...")
                time.sleep(retry_delay * (attempt + 1))
                continue
            else:
                print(f"Error saving version: {e}")
                return False
        except Exception as e:
            if conn:
                conn.close()
            print(f"Error saving version: {e}")
            return False
        finally:
            if conn:
                conn.close()
    
    return False

def update_rating(version_id: str, rating: Any) -> bool:
    """Update the rating for a version with retry logic. Rating can be int (legacy) or dict (JSON format)"""
    max_retries = 3
    retry_delay = 0.1
    
    # Convert rating to JSON format
    rating_json = None
    if rating is not None:
        if isinstance(rating, dict):
            rating_json = json.dumps(rating)
        elif isinstance(rating, int):
            # Legacy: convert int to JSON format
            rating_json = json.dumps({"overall": rating})
        else:
            rating_json = json.dumps(rating) if not isinstance(rating, str) else rating
    
    for attempt in range(max_retries):
        conn = None
        try:
            conn = get_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                UPDATE evaluation_versions 
                SET rating = ?
                WHERE version_id = ?
            """, (rating_json, version_id))
            
            conn.commit()
            print(f"Updated rating for version {version_id} to {rating}")
            return True
        except sqlite3.OperationalError as e:
            if conn:
                conn.close()
            if "database is locked" in str(e).lower() and attempt < max_retries - 1:
                print(f"Database locked, retrying ({attempt + 1}/{max_retries})...")
                time.sleep(retry_delay * (attempt + 1))
                continue
            else:
                print(f"Error updating rating: {e}")
                return False
        except Exception as e:
            if conn:
                conn.close()
            print(f"Error updating rating: {e}")
            return False
        finally:
            if conn:
                conn.close()
    
    return False

def event_exists_in_db(event_id: str) -> bool:
    """Check if an event exists in the database"""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT COUNT(*) FROM evaluation_versions 
            WHERE event_id = ?
        """, (event_id,))
        
        count = cursor.fetchone()[0]
        return count > 0
    except Exception as e:
        print(f"Error checking if event exists: {e}")
        return False
    finally:
        if conn:
            conn.close()

def get_initial_version_by_event(event_id: str) -> Optional[Dict[str, Any]]:
    """Get the initial version for an event (if it exists)"""
    conn = None
    try:
        conn = get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        initial_version_id = f"{event_id}_initial"
        cursor.execute("""
            SELECT * FROM evaluation_versions 
            WHERE version_id = ?
        """, (initial_version_id,))
        
        row = cursor.fetchone()
        
        if row:
            return {
                "id": row["id"],
                "version_id": row["version_id"],
                "event_id": row["event_id"],
                "model_provider": row["model_provider"],
                "model_name": row["model_name"],
                "user_prompt": row["user_prompt"],
                "image_urls": json.loads(row["image_urls"]) if row["image_urls"] else [],
                "assistant_response": json.loads(row["assistant_response"]) if row["assistant_response"] else {},
                "rating": _parse_rating(row["rating"]),
                "metadata": json.loads(row["metadata"]) if row["metadata"] else {},
                "created_at": row["created_at"]
            }
        return None
    except Exception as e:
        print(f"Error getting initial version: {e}")
        return None
    finally:
        if conn:
            conn.close()

def get_versions_by_event(event_id: str) -> List[Dict[str, Any]]:
    """Get all versions for a specific event"""
    conn = None
    try:
        conn = get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT * FROM evaluation_versions 
            WHERE event_id = ?
            ORDER BY created_at DESC
        """, (event_id,))
        
        rows = cursor.fetchall()
        
        versions = []
        for row in rows:
            versions.append({
                "id": row["id"],
                "version_id": row["version_id"],
                "event_id": row["event_id"],
                "model_provider": row["model_provider"],
                "model_name": row["model_name"],
                "user_prompt": row["user_prompt"],
                "image_urls": json.loads(row["image_urls"]) if row["image_urls"] else [],
                "assistant_response": json.loads(row["assistant_response"]),
                "rating": _parse_rating(row["rating"]),
                "metadata": json.loads(row["metadata"]) if row["metadata"] else {},
                "created_at": row["created_at"]
            })
        
        return versions
    except Exception as e:
        print(f"Error getting versions: {e}")
        return []
    finally:
        if conn:
            conn.close()

def get_version_by_id(version_id: str) -> Optional[Dict[str, Any]]:
    """Get a specific version by ID"""
    conn = None
    try:
        conn = get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT * FROM evaluation_versions 
            WHERE version_id = ?
        """, (version_id,))
        
        row = cursor.fetchone()
        
        if row:
            return {
                "id": row["id"],
                "version_id": row["version_id"],
                "event_id": row["event_id"],
                "model_provider": row["model_provider"],
                "model_name": row["model_name"],
                "user_prompt": row["user_prompt"],
                "image_urls": json.loads(row["image_urls"]) if row["image_urls"] else [],
                "assistant_response": json.loads(row["assistant_response"]),
                "rating": _parse_rating(row["rating"]),
                "metadata": json.loads(row["metadata"]) if row["metadata"] else {},
                "created_at": row["created_at"]
            }
        return None
    except Exception as e:
        print(f"Error getting version: {e}")
        return None
    finally:
        if conn:
            conn.close()

def get_all_events() -> List[Dict[str, Any]]:
    """Get all unique events with their latest version info"""
    conn = None
    try:
        conn = get_connection()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Get all ratings for each event to calculate max (handles JSON format)
        cursor.execute("""
            SELECT event_id, rating
            FROM evaluation_versions
            WHERE rating IS NOT NULL
        """)
        
        all_ratings = cursor.fetchall()
        event_max_ratings = {}
        for event_id, rating_json in all_ratings:
            rating = _parse_rating(rating_json)
            if rating:
                overall = rating.get('overall') if isinstance(rating, dict) else rating
                if overall and isinstance(overall, (int, float)):
                    if event_id not in event_max_ratings or overall > event_max_ratings[event_id]:
                        event_max_ratings[event_id] = int(overall)
        
        # Get event summaries
        cursor.execute("""
            SELECT 
                event_id,
                MAX(created_at) as last_updated,
                COUNT(*) as version_count
            FROM evaluation_versions
            GROUP BY event_id
            ORDER BY last_updated DESC
        """)
        
        rows = cursor.fetchall()
        
        events = []
        for row in rows:
            events.append({
                "event_id": row["event_id"],
                "last_updated": row["last_updated"],
                "version_count": row["version_count"],
                "max_rating": event_max_ratings.get(row["event_id"])
            })
        
        return events
    except Exception as e:
        print(f"Error getting all events: {e}")
        return []
    finally:
        if conn:
            conn.close()

# ============= Chain-specific functions =============

def save_chain_version(
    version_id: str,
    trace_id: str,
    chain_name: str,
    chain_events: List[Dict[str, Any]],
    total_tokens_input: int,
    total_tokens_output: int,
    total_cost: float,
    rating: Optional[Any] = None,  # Can be int (legacy) or dict (new JSON format)
    metadata: Optional[Dict[str, Any]] = None
) -> bool:
    """Save a chain version"""
    for i in range(3):
        conn = None
        try:
            conn = get_connection()
            cursor = conn.cursor()
            
            # Convert rating to JSON if it's a dict, or keep as is if None
            rating_json = None
            if rating is not None:
                if isinstance(rating, dict):
                    rating_json = json.dumps(rating)
                elif isinstance(rating, int):
                    # Legacy: convert int to JSON format
                    rating_json = json.dumps({"overall": rating})
                else:
                    rating_json = json.dumps(rating) if not isinstance(rating, str) else rating
            
            cursor.execute("""
                INSERT INTO chain_versions 
                (version_id, trace_id, chain_name, chain_events, 
                 total_tokens_input, total_tokens_output, total_cost, rating, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                version_id,
                trace_id,
                chain_name,
                json.dumps(chain_events),
                total_tokens_input,
                total_tokens_output,
                total_cost,
                rating_json,
                json.dumps(metadata) if metadata else None
            ))
            
            conn.commit()
            print(f"Saved chain version {version_id} for trace {trace_id}")
            return True
        except sqlite3.IntegrityError:
            print(f"Chain version {version_id} already exists")
            return False
        except sqlite3.OperationalError as e:
            if "database is locked" in str(e) and i < 2:
                print(f"Database locked, retrying... ({i+1}/3)")
                time.sleep(2 ** i)
            else:
                print(f"Error saving chain version: {e}")
                return False
        except Exception as e:
            print(f"Error saving chain version: {e}")
            return False
        finally:
            if conn:
                conn.close()
    return False

def get_chain_versions_by_trace(trace_id: str) -> List[Dict[str, Any]]:
    """Get all chain versions for a trace ID"""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT version_id, trace_id, chain_name, chain_events,
                   total_tokens_input, total_tokens_output, total_cost,
                   rating, metadata, created_at
            FROM chain_versions
            WHERE trace_id = ?
            ORDER BY created_at DESC
        """, (trace_id,))
        
        rows = cursor.fetchall()
        versions = []
        for row in rows:
            versions.append({
                "version_id": row[0],
                "trace_id": row[1],
                "chain_name": row[2],
                "chain_events": json.loads(row[3]),
                "total_tokens_input": row[4],
                "total_tokens_output": row[5],
                "total_cost": row[6],
                "rating": _parse_rating(row[7]),
                "metadata": json.loads(row[8]) if row[8] else {},
                "created_at": row[9]
            })
        return versions
    except Exception as e:
        print(f"Error getting chain versions: {e}")
        return []
    finally:
        if conn:
            conn.close()

def update_chain_rating(version_id: str, rating: Any) -> bool:
    """Update rating for a chain version. Rating can be int (legacy) or dict (JSON format)"""
    # Convert rating to JSON format
    rating_json = None
    if rating is not None:
        if isinstance(rating, dict):
            rating_json = json.dumps(rating)
        elif isinstance(rating, int):
            # Legacy: convert int to JSON format
            rating_json = json.dumps({"overall": rating})
        else:
            rating_json = json.dumps(rating) if not isinstance(rating, str) else rating
    
    for i in range(3):
        conn = None
        try:
            conn = get_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                UPDATE chain_versions
                SET rating = ?
                WHERE version_id = ?
            """, (rating_json, version_id))
            
            conn.commit()
            return cursor.rowcount > 0
        except sqlite3.OperationalError as e:
            if "database is locked" in str(e) and i < 2:
                print(f"Database locked, retrying... ({i+1}/3)")
                time.sleep(2 ** i)
            else:
                print(f"Error updating chain rating: {e}")
                return False
        except Exception as e:
            print(f"Error updating chain rating: {e}")
            return False
        finally:
            if conn:
                conn.close()
    return False

def update_chain_step_rating(version_id: str, step_index: int, rating: Optional[Dict[str, Any]]) -> bool:
    """Update rating for a specific step in a chain version"""
    for i in range(3):
        conn = None
        try:
            conn = get_connection()
            cursor = conn.cursor()
            
            # Get current chain_events
            cursor.execute("SELECT chain_events FROM chain_versions WHERE version_id = ?", (version_id,))
            row = cursor.fetchone()
            if not row:
                return False
            
            chain_events = json.loads(row[0])
            
            # Validate step_index
            if step_index < 0 or step_index >= len(chain_events):
                return False
            
            # Update the rating for the specific step
            if rating is not None:
                chain_events[step_index]['rating'] = rating
            else:
                # Remove rating if None
                if 'rating' in chain_events[step_index]:
                    del chain_events[step_index]['rating']
            
            # Update the database
            cursor.execute("""
                UPDATE chain_versions
                SET chain_events = ?
                WHERE version_id = ?
            """, (json.dumps(chain_events), version_id))
            
            conn.commit()
            return cursor.rowcount > 0
        except sqlite3.OperationalError as e:
            if "database is locked" in str(e) and i < 2:
                print(f"Database locked, retrying... ({i+1}/3)")
                time.sleep(2 ** i)
            else:
                print(f"Error updating chain step rating: {e}")
                return False
        except Exception as e:
            print(f"Error updating chain step rating: {e}")
            return False
        finally:
            if conn:
                conn.close()
    return False

def trace_exists_in_db(trace_id: str) -> bool:
    """Check if a trace ID exists in the database"""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM chain_versions WHERE trace_id = ? LIMIT 1", (trace_id,))
        return cursor.fetchone() is not None
    except Exception as e:
        print(f"Error checking trace existence: {e}")
        return False
    finally:
        if conn:
            conn.close()

def get_initial_chain_by_trace(trace_id: str) -> Optional[Dict[str, Any]]:
    """Get the initial chain version for a trace ID"""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        version_id = f"{trace_id}_initial"
        cursor.execute("""
            SELECT version_id, trace_id, chain_name, chain_events,
                   total_tokens_input, total_tokens_output, total_cost,
                   rating, metadata, created_at
            FROM chain_versions
            WHERE version_id = ?
        """, (version_id,))
        
        row = cursor.fetchone()
        if row:
            return {
                "version_id": row[0],
                "trace_id": row[1],
                "chain_name": row[2],
                "chain_events": json.loads(row[3]),
                "total_tokens_input": row[4],
                "total_tokens_output": row[5],
                "total_cost": row[6],
                "rating": _parse_rating(row[7]),
                "metadata": json.loads(row[8]) if row[8] else {},
                "created_at": row[9]
            }
        return None
    except Exception as e:
        print(f"Error getting initial chain: {e}")
        return None
    finally:
        if conn:
            conn.close()

def get_all_trace_ids() -> List[str]:
    """Get all unique trace IDs from the database"""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT trace_id FROM chain_versions ORDER BY trace_id")
        return [row[0] for row in cursor.fetchall()]
    except Exception as e:
        print(f"Error getting trace IDs: {e}")
        return []
    finally:
        if conn:
            conn.close()

def get_all_chains():
    """Get all chains with their stats"""
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH, timeout=10.0)
        conn.execute("PRAGMA journal_mode=WAL")
        cursor = conn.cursor()
        
        # Get all chain ratings to calculate max
        cursor.execute("""
            SELECT trace_id, rating
            FROM chain_versions
            WHERE rating IS NOT NULL
        """)
        
        all_ratings = cursor.fetchall()
        chain_max_ratings = {}
        for trace_id, rating_json in all_ratings:
            rating = _parse_rating(rating_json)
            if rating:
                overall = rating.get('overall') if isinstance(rating, dict) else rating
                if overall and isinstance(overall, (int, float)):
                    if trace_id not in chain_max_ratings or overall > chain_max_ratings[trace_id]:
                        chain_max_ratings[trace_id] = int(overall)
        
        # Get chain summaries
        cursor.execute("""
            SELECT 
                trace_id,
                chain_name,
                COUNT(*) as version_count,
                MAX(created_at) as last_updated
            FROM chain_versions 
            GROUP BY trace_id, chain_name
            ORDER BY last_updated DESC
        """)
        
        chains = []
        for row in cursor.fetchall():
            chains.append({
                "trace_id": row[0],
                "chain_name": row[1],
                "version_count": row[2],
                "max_rating": chain_max_ratings.get(row[0]),
                "last_updated": row[3]
            })
        
        return chains
    except Exception as e:
        print(f"Error getting chains: {e}")
        return []
    finally:
        if conn:
            conn.close()

# Settings Management
def get_setting(key: str, default: Optional[str] = None) -> Optional[str]:
    """Get a setting value from database, fallback to environment variable"""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
        row = cursor.fetchone()
        if row and row[0]:
            return row[0]
        # Fallback to environment variable
        return os.getenv(key, default)
    except Exception as e:
        print(f"Error getting setting {key}: {e}")
        # Fallback to environment variable
        return os.getenv(key, default)
    finally:
        if conn:
            conn.close()


def set_setting(key: str, value: str, description: Optional[str] = None) -> bool:
    """Set a setting value in database"""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO settings (key, value, description, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                description = COALESCE(excluded.description, description),
                updated_at = CURRENT_TIMESTAMP
        """, (key, value, description))
        conn.commit()
        return True
    except Exception as e:
        print(f"Error setting {key}: {e}")
        return False
    finally:
        if conn:
            conn.close()


def get_all_settings() -> Dict[str, Any]:
    """Get all settings as a dictionary"""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT key, value, description FROM settings")
        rows = cursor.fetchall()
        
        settings = {}
        for row in rows:
            settings[row[0]] = {
                "value": row[1] or "",
                "description": row[2] or ""
            }
        return settings
    except Exception as e:
        print(f"Error getting all settings: {e}")
        return {}
    finally:
        if conn:
            conn.close()


def delete_setting(key: str) -> bool:
    """Delete a setting from database"""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM settings WHERE key = ?", (key,))
        conn.commit()
        return cursor.rowcount > 0
    except Exception as e:
        print(f"Error deleting setting {key}: {e}")
        return False
    finally:
        if conn:
            conn.close()

def delete_event(event_id: str) -> bool:
    """Delete all versions for an event"""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM evaluation_versions WHERE event_id = ?", (event_id,))
        conn.commit()
        return cursor.rowcount > 0
    except Exception as e:
        print(f"Error deleting event {event_id}: {e}")
        return False
    finally:
        if conn:
            conn.close()

def delete_chain(trace_id: str) -> bool:
    """Delete all versions for a chain"""
    conn = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM chain_versions WHERE trace_id = ?", (trace_id,))
        conn.commit()
        return cursor.rowcount > 0
    except Exception as e:
        print(f"Error deleting chain {trace_id}: {e}")
        return False
    finally:
        if conn:
            conn.close()


# Database initialization is called from app/main.py on startup

