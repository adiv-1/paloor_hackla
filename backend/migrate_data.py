#!/usr/bin/env python3
"""Migrate data from SQLite databases to PostgreSQL."""
import sqlite3
import psycopg2
import json
from datetime import datetime, timezone

PG_CONN = {
    'host': '127.0.0.1',
    'port': 5432,
    'dbname': 'paloor',
    'user': 'paloor',
    'password': 'paloor_prod_2026'
}

def epoch_to_ts(epoch_val):
    """Convert epoch float to ISO timestamp string for PostgreSQL."""
    if epoch_val is None or epoch_val == 0:
        return None
    try:
        return datetime.fromtimestamp(float(epoch_val), tz=timezone.utc).isoformat()
    except (ValueError, OSError):
        return None

def iso_or_epoch_to_ts(val):
    """Handle both ISO strings and epoch floats."""
    if val is None:
        return None
    if isinstance(val, str) and 'T' in val:
        return val  # Already ISO
    return epoch_to_ts(val)

def migrate():
    pg = psycopg2.connect(**PG_CONN)
    pg.autocommit = False
    cur = pg.cursor()

    try:
        # === USERS ===
        print("Migrating users...")
        sdb = sqlite3.connect('/tmp/users.db')
        sdb.row_factory = sqlite3.Row
        for r in sdb.execute("SELECT * FROM users"):
            cur.execute("""
                INSERT INTO users (id, email, name, hashed_password, created_at,
                    email_verified, profile_completed, age, gender, occupation,
                    annual_income, net_worth_estimate, financial_goals,
                    risk_tolerance, abstraction_level, dependents, state, photo_path)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (id) DO NOTHING
            """, (
                r['id'], r['email'], r['name'], r['hashed_password'],
                iso_or_epoch_to_ts(r['created_at']),
                bool(r['email_verified']), bool(r['profile_completed']),
                r['age'], r['gender'], r['occupation'],
                r['annual_income'], r['net_worth_estimate'],
                json.dumps(json.loads(r['financial_goals'])) if r['financial_goals'] else '[]',
                r['risk_tolerance'], r['abstraction_level'] or 'beginner',
                r['dependents'], r['state'], r['photo_path']
            ))
        sdb.close()
        print(f"  Users migrated: {cur.rowcount}")

        # === ADMIN ===
        print("Migrating admin...")
        sdb = sqlite3.connect('/tmp/admin.db')
        sdb.row_factory = sqlite3.Row
        for r in sdb.execute("SELECT * FROM admin_users"):
            cur.execute("""
                INSERT INTO admin_users (id, email, name, hashed_password, role,
                    is_active, created_at, last_login_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (id) DO NOTHING
            """, (
                r['id'], r['email'], r['name'], r['hashed_password'],
                r['role'], bool(r['is_active']),
                epoch_to_ts(r['created_at']), epoch_to_ts(r['last_login_at'])
            ))
        for r in sdb.execute("SELECT * FROM crm_notes"):
            cur.execute("""
                INSERT INTO crm_notes (id, user_id, admin_id, admin_name, content, note_type, created_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (id) DO NOTHING
            """, (r['id'], r['user_id'], r['admin_id'], r['admin_name'],
                  r['content'], r['note_type'], epoch_to_ts(r['created_at'])))
        for r in sdb.execute("SELECT * FROM revenue_entries"):
            cur.execute("""
                INSERT INTO revenue_entries (id, category, description, amount, entry_type, date, created_by, created_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (id) DO NOTHING
            """, (r['id'], r['category'], r['description'], r['amount'],
                  r['entry_type'], r['date'], r['created_by'], epoch_to_ts(r['created_at'])))
        sdb.close()
        print("  Admin migrated")

        # === CHAT ===
        print("Migrating chat...")
        sdb = sqlite3.connect('/tmp/chat.db')
        sdb.row_factory = sqlite3.Row

        for r in sdb.execute("SELECT * FROM conversations"):
            cur.execute("""
                INSERT INTO conversations (id, type, name, description, category,
                    created_by, created_at, avatar_url, is_archived, last_message_at, metadata)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (id) DO NOTHING
            """, (
                r['id'], r['type'], r['name'], r['description'], r['category'],
                r['created_by'], epoch_to_ts(r['created_at']),
                r['avatar_url'], bool(r['is_archived']),
                epoch_to_ts(r['last_message_at']),
                r['metadata_json'] or '{}'
            ))

        for r in sdb.execute("SELECT * FROM conversation_members"):
            cur.execute("""
                INSERT INTO conversation_members (conversation_id, user_id, role,
                    joined_at, ai_nudge_enabled, position)
                VALUES (%s,%s,%s,%s,%s,%s)
                ON CONFLICT (conversation_id, user_id) DO NOTHING
            """, (
                r['conversation_id'], r['user_id'], r['role'],
                epoch_to_ts(r['joined_at']),
                bool(r['ai_nudge_enabled']), r['position']
            ))

        for r in sdb.execute("SELECT * FROM messages"):
            cur.execute("""
                INSERT INTO messages (id, conversation_id, sender_id, sender_name,
                    content, reply_to, is_ai_generated, is_private_nudge,
                    created_at, edited_at, metadata)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (id) DO NOTHING
            """, (
                r['id'], r['conversation_id'], r['sender_id'], r['sender_name'],
                r['content'], r['reply_to'],
                bool(r['is_ai_generated']), bool(r['is_private_nudge']),
                epoch_to_ts(r['created_at']), epoch_to_ts(r['edited_at']),
                r['metadata_json'] or '{}'
            ))

        for r in sdb.execute("SELECT * FROM attachments"):
            cur.execute("""
                INSERT INTO attachments (id, message_id, type, filename, mime_type,
                    file_path, size, thumbnail_path)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (id) DO NOTHING
            """, (r['id'], r['message_id'], r['type'], r['filename'],
                  r['mime_type'], r['file_path'], r['size'], r['thumbnail_path']))

        for r in sdb.execute("SELECT * FROM user_contexts"):
            cur.execute("""
                INSERT INTO user_contexts (user_id, context, summary, updated_at)
                VALUES (%s,%s,%s,%s)
                ON CONFLICT (user_id) DO NOTHING
            """, (
                r['user_id'],
                r['context_json'] or '{}',
                r['summary'], epoch_to_ts(r['updated_at'])
            ))

        for r in sdb.execute("SELECT * FROM chat_folders"):
            cur.execute("""
                INSERT INTO chat_folders (id, user_id, name, created_at)
                VALUES (%s,%s,%s,%s)
                ON CONFLICT (id) DO NOTHING
            """, (r['id'], r['user_id'], r['name'], epoch_to_ts(r['created_at'])))

        for r in sdb.execute("SELECT * FROM chat_folder_items"):
            cur.execute("""
                INSERT INTO chat_folder_items (folder_id, conversation_id)
                VALUES (%s,%s)
                ON CONFLICT DO NOTHING
            """, (r['folder_id'], r['conversation_id']))

        sdb.close()
        print("  Chat migrated")

        # === LINKED ACCOUNTS ===
        print("Migrating linked accounts...")
        sdb = sqlite3.connect('/tmp/accounts.db')
        sdb.row_factory = sqlite3.Row
        count = 0
        for r in sdb.execute("SELECT * FROM linked_accounts"):
            cur.execute("""
                INSERT INTO linked_accounts (id, user_id, institution, account_type,
                    account_name, mask, balance, currency, subtype, linked_at,
                    last_synced, status, metadata)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (id) DO NOTHING
            """, (
                r['id'], r['user_id'], r['institution'], r['account_type'],
                r['account_name'], r['mask'], r['balance'], r['currency'],
                r['subtype'], epoch_to_ts(r['linked_at']),
                epoch_to_ts(r['last_synced']), r['status'],
                r['metadata_json'] or '{}'
            ))
            count += 1
        sdb.close()
        print(f"  Linked accounts: {count}")

        # === EQUITIES (all empty, skip) ===
        print("Equities: all tables empty, skipping")

        # === MEMORY (all empty, skip) ===
        print("Memory: all tables empty, skipping")

        pg.commit()
        print("\n=== Migration complete! ===")

        # Verify
        cur.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
        tables = [r[0] for r in cur.fetchall()]
        for t in tables:
            cur.execute(f"SELECT count(*) FROM {t}")
            count = cur.fetchone()[0]
            if count > 0:
                print(f"  {t}: {count} rows")

    except Exception as e:
        pg.rollback()
        print(f"ERROR: {e}")
        raise
    finally:
        cur.close()
        pg.close()

if __name__ == '__main__':
    migrate()
