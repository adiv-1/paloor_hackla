"""
Cohort system — time-limited group chats with wealth managers.

Handles:
  - Wealth manager registration/lookup
  - Cohort creation, matching, lifecycle
  - Anonymized member names
  - Ambient AI engagement (smart, credit-conscious)
"""
from __future__ import annotations

import json
import logging
import random
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from database import pg_cursor

logger = logging.getLogger(__name__)

# Anonymized name pool — friendly, non-identifying
ANON_NAMES = [
    "Investor Alpha", "Investor Beta", "Investor Gamma",
    "Investor Delta", "Investor Epsilon", "Investor Zeta",
    "Investor Eta", "Investor Theta", "Investor Iota",
    "Investor Kappa", "Investor Lambda", "Investor Mu",
]

LIFE_STAGES = [
    {"key": "early_career", "label": "Early Career (22-30)", "description": "Building foundations, student debt, first investments"},
    {"key": "mid_career", "label": "Mid Career (30-45)", "description": "Growing wealth, family planning, home buying"},
    {"key": "peak_earning", "label": "Peak Earning (45-55)", "description": "Maximizing savings, college planning, catch-up contributions"},
    {"key": "pre_retirement", "label": "Pre-Retirement (55-65)", "description": "Transition planning, risk reduction, income strategies"},
    {"key": "retired", "label": "Retired (65+)", "description": "Income distribution, estate planning, healthcare costs"},
]

COHORT_DURATION_HOURS = 48  # 2 days


def _gen_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


# ---------------------------------------------------------------------------
# Wealth Manager CRUD
# ---------------------------------------------------------------------------

def register_wealth_manager(user_id: str, firm_name: str = "",
                            license_number: str = "", specializations: list = None,
                            bio: str = "") -> dict:
    """Register an existing user as a wealth manager."""
    wm_id = _gen_id("wm")
    with pg_cursor() as cur:
        # Check user exists
        cur.execute("SELECT id FROM users WHERE id = %s", (user_id,))
        if not cur.fetchone():
            raise ValueError("User not found")
        # Check not already registered
        cur.execute("SELECT id FROM wealth_managers WHERE user_id = %s", (user_id,))
        if cur.fetchone():
            raise ValueError("Already registered as wealth manager")
        cur.execute(
            """INSERT INTO wealth_managers (id, user_id, firm_name, license_number, specializations, bio, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
            (wm_id, user_id, firm_name, license_number,
             json.dumps(specializations or []), bio, datetime.now(timezone.utc)),
        )
    return get_wealth_manager(wm_id)


def get_wealth_manager(wm_id: str) -> Optional[dict]:
    with pg_cursor() as cur:
        cur.execute(
            """SELECT wm.*, u.name as user_name, u.email as user_email
               FROM wealth_managers wm JOIN users u ON wm.user_id = u.id
               WHERE wm.id = %s""",
            (wm_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        d = dict(row)
        d["specializations"] = d.get("specializations") or []
        return d


def get_wealth_manager_by_user(user_id: str) -> Optional[dict]:
    with pg_cursor() as cur:
        cur.execute(
            """SELECT wm.*, u.name as user_name, u.email as user_email
               FROM wealth_managers wm JOIN users u ON wm.user_id = u.id
               WHERE wm.user_id = %s""",
            (user_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        d = dict(row)
        d["specializations"] = d.get("specializations") or []
        return d


def is_wealth_manager(user_id: str) -> bool:
    with pg_cursor() as cur:
        cur.execute("SELECT 1 FROM wealth_managers WHERE user_id = %s AND is_active = TRUE", (user_id,))
        return cur.fetchone() is not None


# ---------------------------------------------------------------------------
# Cohort Lifecycle
# ---------------------------------------------------------------------------

def create_cohort(wm_user_id: str, life_stage: str, max_members: int = 6,
                  duration_hours: int = COHORT_DURATION_HOURS) -> dict:
    """Create a new cohort conversation. Only callable by wealth managers."""
    wm = get_wealth_manager_by_user(wm_user_id)
    if not wm:
        raise ValueError("Not a registered wealth manager")

    now = datetime.now(timezone.utc)
    expires = now + timedelta(hours=duration_hours)

    # Get WM's display name
    wm_name = wm.get("user_name", "Wealth Manager")

    # Find the life stage label
    stage_label = life_stage
    for s in LIFE_STAGES:
        if s["key"] == life_stage:
            stage_label = s["label"]
            break

    conv_id = _gen_id("conv")
    cohort_id = _gen_id("cohort")

    with pg_cursor() as cur:
        # Create the conversation
        cur.execute(
            """INSERT INTO conversations
               (id, type, name, description, category, created_by, created_at, last_message_at, expires_at, metadata)
               VALUES (%s, 'cohort', %s, %s, %s, %s, %s, %s, %s, %s)""",
            (conv_id, f"{stage_label} Cohort", f"A {duration_hours}-hour cohort session with a wealth manager",
             life_stage, wm_user_id, now, now, expires,
             json.dumps({"cohort_id": cohort_id, "wm_id": wm["id"]})),
        )

        # Add WM as member with wealth_manager role
        cur.execute(
            """INSERT INTO conversation_members (conversation_id, user_id, role, display_name, joined_at, agreed_to_terms)
               VALUES (%s, %s, 'wealth_manager', %s, %s, FALSE)""",
            (conv_id, wm_user_id, wm_name, now),
        )

        # Create cohort record
        cur.execute(
            """INSERT INTO cohorts (id, conversation_id, wm_id, max_members, life_stage, status, created_at, started_at, expires_at)
               VALUES (%s, %s, %s, %s, %s, 'active', %s, %s, %s)""",
            (cohort_id, conv_id, wm["id"], max_members, life_stage, now, now, expires),
        )

    return get_cohort(cohort_id)


def get_cohort(cohort_id: str) -> Optional[dict]:
    with pg_cursor() as cur:
        cur.execute(
            """SELECT co.*, c.name as conv_name, c.expires_at as conv_expires_at
               FROM cohorts co JOIN conversations c ON co.conversation_id = c.id
               WHERE co.id = %s""",
            (cohort_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        d = dict(row)
        # Get member count
        cur.execute(
            "SELECT COUNT(*) as cnt FROM conversation_members WHERE conversation_id = %s",
            (d["conversation_id"],),
        )
        d["member_count"] = cur.fetchone()["cnt"]
        return d


def get_cohort_by_conversation(conv_id: str) -> Optional[dict]:
    with pg_cursor() as cur:
        cur.execute("SELECT * FROM cohorts WHERE conversation_id = %s", (conv_id,))
        row = cur.fetchone()
        if not row:
            return None
        return dict(row)


def list_available_cohorts(life_stage: str = None) -> List[dict]:
    """List active cohorts that still have room for members."""
    with pg_cursor() as cur:
        sql = """
            SELECT co.*, c.name as conv_name, c.expires_at as conv_expires_at,
                   u.name as wm_name, wm.firm_name,
                   (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = co.conversation_id) as member_count
            FROM cohorts co
            JOIN conversations c ON co.conversation_id = c.id
            JOIN wealth_managers wm ON co.wm_id = wm.id
            JOIN users u ON wm.user_id = u.id
            WHERE co.status = 'active'
              AND c.expires_at > NOW()
        """
        params: list = []
        if life_stage:
            sql += " AND co.life_stage = %s"
            params.append(life_stage)
        sql += " ORDER BY co.created_at DESC"
        cur.execute(sql, params)
        rows = cur.fetchall()
        results = []
        for row in rows:
            d = dict(row)
            if d["member_count"] < d["max_members"]:
                results.append(d)
        return results


def join_cohort(conv_id: str, user_id: str, user_consented: bool = False) -> dict:
    """Join a cohort. Assigns an anonymized display name.

    `user_consented` records that the user explicitly acknowledged the
    information that will be shared with the wealth manager.
    """
    with pg_cursor() as cur:
        # Verify it's a cohort and still active
        cur.execute(
            """SELECT co.*, c.expires_at
               FROM cohorts co JOIN conversations c ON co.conversation_id = c.id
               WHERE co.conversation_id = %s AND co.status = 'active'""",
            (conv_id,),
        )
        cohort = cur.fetchone()
        if not cohort:
            raise ValueError("Cohort not found or expired")

        if cohort["expires_at"] and cohort["expires_at"] < datetime.now(timezone.utc):
            raise ValueError("Cohort has expired")

        # Check not already a member
        cur.execute(
            "SELECT 1 FROM conversation_members WHERE conversation_id = %s AND user_id = %s",
            (conv_id, user_id),
        )
        if cur.fetchone():
            raise ValueError("Already a member of this cohort")

        # Check capacity
        cur.execute(
            "SELECT COUNT(*) as cnt FROM conversation_members WHERE conversation_id = %s",
            (conv_id,),
        )
        count = cur.fetchone()["cnt"]
        if count >= cohort["max_members"] + 1:  # +1 for the WM
            raise ValueError("Cohort is full")

        # Assign anonymized name — pick one not yet used in this cohort
        cur.execute(
            "SELECT display_name FROM conversation_members WHERE conversation_id = %s AND role = 'member'",
            (conv_id,),
        )
        used_names = {r["display_name"] for r in cur.fetchall()}
        available = [n for n in ANON_NAMES if n not in used_names]
        display_name = available[0] if available else f"Investor {count}"

        now = datetime.now(timezone.utc)
        cur.execute(
            """INSERT INTO conversation_members
               (conversation_id, user_id, role, display_name, joined_at, agreed_to_terms, user_agreed_to_terms)
               VALUES (%s, %s, 'member', %s, %s, FALSE, %s)""",
            (conv_id, user_id, display_name, now, bool(user_consented)),
        )

    return {"display_name": display_name, "conversation_id": conv_id}


def leave_cohort(conv_id: str, user_id: str) -> bool:
    with pg_cursor() as cur:
        cur.execute(
            "DELETE FROM conversation_members WHERE conversation_id = %s AND user_id = %s AND role = 'member'",
            (conv_id, user_id),
        )
        return True


def agree_to_terms(conv_id: str, user_id: str) -> bool:
    """Wealth manager agrees to not misuse client data."""
    with pg_cursor() as cur:
        cur.execute(
            """UPDATE conversation_members SET agreed_to_terms = TRUE
               WHERE conversation_id = %s AND user_id = %s AND role = 'wealth_manager'""",
            (conv_id, user_id),
        )
        return True


def get_cohort_members(conv_id: str, requesting_user_id: str) -> List[dict]:
    """
    Get cohort members with appropriate visibility.
    - WMs who agreed to terms see real profiles
    - Regular members see only anonymized names
    """
    with pg_cursor() as cur:
        # Check if requester is a WM who agreed to terms
        cur.execute(
            """SELECT role, agreed_to_terms FROM conversation_members
               WHERE conversation_id = %s AND user_id = %s""",
            (conv_id, requesting_user_id),
        )
        requester = cur.fetchone()
        if not requester:
            return []

        is_wm_with_access = (
            requester["role"] == "wealth_manager" and requester["agreed_to_terms"]
        )

        cur.execute(
            """SELECT cm.user_id, cm.role, cm.display_name, cm.joined_at, cm.agreed_to_terms,
                      u.name, u.age, u.occupation, u.annual_income, u.net_worth_estimate,
                      u.risk_tolerance, u.financial_goals, u.state
               FROM conversation_members cm
               JOIN users u ON cm.user_id = u.id
               WHERE cm.conversation_id = %s""",
            (conv_id,),
        )
        members = []
        for row in cur.fetchall():
            d = dict(row)
            member = {
                "user_id": d["user_id"],
                "role": d["role"],
                "display_name": d["display_name"],
                "joined_at": d["joined_at"],
            }

            if d["role"] == "wealth_manager":
                # WM name is always visible
                member["name"] = d["name"]
            elif is_wm_with_access:
                # WM with agreement can see real profiles
                member["name"] = d["name"]
                member["age"] = d["age"]
                member["occupation"] = d["occupation"]
                member["annual_income"] = d["annual_income"]
                member["net_worth_estimate"] = d["net_worth_estimate"]
                member["risk_tolerance"] = d["risk_tolerance"]
                member["financial_goals"] = d["financial_goals"]
                member["state"] = d["state"]
            # else: regular members only see display_name (already set)

            members.append(member)
        return members


def get_display_name(conv_id: str, user_id: str) -> str:
    """Get a user's display name in a cohort."""
    with pg_cursor() as cur:
        cur.execute(
            "SELECT display_name FROM conversation_members WHERE conversation_id = %s AND user_id = %s",
            (conv_id, user_id),
        )
        row = cur.fetchone()
        return row["display_name"] if row else "Unknown"


def list_wm_cohorts(wm_user_id: str) -> List[dict]:
    """List all cohorts managed by a wealth manager."""
    with pg_cursor() as cur:
        cur.execute(
            """SELECT co.*, c.name as conv_name, c.expires_at as conv_expires_at,
                      (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = co.conversation_id) as member_count
               FROM cohorts co
               JOIN conversations c ON co.conversation_id = c.id
               JOIN wealth_managers wm ON co.wm_id = wm.id
               WHERE wm.user_id = %s
               ORDER BY co.created_at DESC""",
            (wm_user_id,),
        )
        return [dict(r) for r in cur.fetchall()]


def expire_cohorts() -> int:
    """Mark expired cohorts. Called periodically or on access."""
    with pg_cursor() as cur:
        cur.execute(
            """UPDATE cohorts SET status = 'expired'
               WHERE status = 'active' AND expires_at < NOW()
               RETURNING id""",
        )
        expired = cur.fetchall()
        return len(expired)


def get_life_stages() -> List[dict]:
    return LIFE_STAGES


# ---------------------------------------------------------------------------
# Marketplace
# ---------------------------------------------------------------------------

def get_marketplace_wms() -> List[dict]:
    """Return all active wealth managers for the public marketplace.

    Includes a count of currently-open cohorts so the UI can show whether
    the WM has a session a user can join right now.
    """
    with pg_cursor() as cur:
        cur.execute(
            """SELECT wm.id, wm.user_id, wm.firm_name, wm.license_number,
                      wm.specializations, wm.bio, wm.is_verified, wm.avatar_url,
                      wm.created_at,
                      u.name AS user_name,
                      CASE WHEN u.photo_path IS NOT NULL AND u.photo_path <> ''
                           THEN '/api/auth/photo/' || u.id
                           ELSE NULL
                      END AS user_photo_url,
                      (
                          SELECT COUNT(*) FROM cohorts co
                          JOIN conversations c ON co.conversation_id = c.id
                          WHERE co.wm_id = wm.id
                            AND co.status = 'active'
                            AND c.expires_at > NOW()
                      ) AS open_cohorts
               FROM wealth_managers wm
               JOIN users u ON wm.user_id = u.id
               WHERE wm.is_active = TRUE
               ORDER BY wm.is_verified DESC, wm.created_at ASC"""
        )
        results = []
        for row in cur.fetchall():
            d = dict(row)
            d["specializations"] = d.get("specializations") or []
            results.append(d)
        return results


# ---------------------------------------------------------------------------
# Seed data — fake wealth managers for the marketplace demo
# ---------------------------------------------------------------------------

# Stable headshots from randomuser.me (CC0, hot-linkable, predictable URLs).
_FAKE_WMS = [
    {
        "name": "Mira Patel",
        "email": "mira.patel@northpeakwealth.demo",
        "firm_name": "North Peak Wealth Advisors",
        "license_number": "CFP-204881",
        "specializations": ["Early Career", "Student Loans", "First-Time Investing"],
        "bio": "CFP® focused on helping 20- and 30-somethings turn their first paycheck into long-term wealth without the jargon.",
        "avatar_url": "https://randomuser.me/api/portraits/women/68.jpg",
        "is_verified": True,
    },
    {
        "name": "James O'Connell",
        "email": "james.oconnell@harborline.demo",
        "firm_name": "Harborline Capital",
        "license_number": "CFA-118742",
        "specializations": ["Mid Career", "Equity Compensation", "Tech RSUs"],
        "bio": "CFA helping mid-career tech employees navigate RSU vesting, AMT, and concentrated stock positions.",
        "avatar_url": "https://randomuser.me/api/portraits/men/32.jpg",
        "is_verified": True,
    },
    {
        "name": "Aisha Robinson",
        "email": "aisha.robinson@cedarhill.demo",
        "firm_name": "Cedarhill Family Office",
        "license_number": "CFP-309115",
        "specializations": ["Pre-Retirement", "529 Plans", "College Funding"],
        "bio": "Helping families balance saving for retirement and putting kids through college without sacrificing either goal.",
        "avatar_url": "https://randomuser.me/api/portraits/women/44.jpg",
        "is_verified": True,
    },
    {
        "name": "Daniel Kim",
        "email": "daniel.kim@meridianadvisory.demo",
        "firm_name": "Meridian Advisory Group",
        "license_number": "CFP-447203",
        "specializations": ["Retirement Income", "Social Security", "Medicare Planning"],
        "bio": "Specializing in retirement income strategies — Social Security timing, Medicare, and tax-efficient withdrawals.",
        "avatar_url": "https://randomuser.me/api/portraits/men/22.jpg",
        "is_verified": True,
    },
    {
        "name": "Elena Voss",
        "email": "elena.voss@silverbirch.demo",
        "firm_name": "Silver Birch Planning",
        "license_number": "CFP-510337",
        "specializations": ["Peak Earning", "Estate Planning", "Trusts"],
        "bio": "20+ years building estate plans for high-earning professionals. Trusts, gifting strategies, generational wealth.",
        "avatar_url": "https://randomuser.me/api/portraits/women/65.jpg",
        "is_verified": True,
    },
    {
        "name": "Marcus Lee",
        "email": "marcus.lee@bluebridge.demo",
        "firm_name": "Bluebridge Investment Partners",
        "license_number": "CFA-298104",
        "specializations": ["Mid Career", "Real Estate", "Alternative Investments"],
        "bio": "Helping clients diversify beyond stocks — real estate syndications, REITs, and private credit.",
        "avatar_url": "https://randomuser.me/api/portraits/men/45.jpg",
        "is_verified": False,
    },
    {
        "name": "Priya Nair",
        "email": "priya.nair@horizonpath.demo",
        "firm_name": "Horizon Path Advisors",
        "license_number": "CFP-612009",
        "specializations": ["Early Career", "Side Hustles", "Crypto Basics"],
        "bio": "Fee-only planner working with creators and freelancers. Quarterly taxes, retirement for the self-employed, sane crypto.",
        "avatar_url": "https://randomuser.me/api/portraits/women/12.jpg",
        "is_verified": True,
    },
    {
        "name": "Robert Hayes",
        "email": "robert.hayes@stoneoak.demo",
        "firm_name": "Stone Oak Wealth",
        "license_number": "CFP-779441",
        "specializations": ["Retired", "Charitable Giving", "Donor-Advised Funds"],
        "bio": "Retired clients who want their wealth to outlive them — charitable planning, family foundations, legacy.",
        "avatar_url": "https://randomuser.me/api/portraits/men/68.jpg",
        "is_verified": True,
    },
    {
        "name": "Sophia Alvarez",
        "email": "sophia.alvarez@lighthousefp.demo",
        "firm_name": "Lighthouse Financial Planning",
        "license_number": "CFP-820556",
        "specializations": ["Mid Career", "Divorce Planning", "Single-Income Households"],
        "bio": "Certified Divorce Financial Analyst helping clients rebuild and protect their finances after major life changes.",
        "avatar_url": "https://randomuser.me/api/portraits/women/33.jpg",
        "is_verified": False,
    },
    {
        "name": "Thomas Becker",
        "email": "thomas.becker@oakcrest.demo",
        "firm_name": "Oakcrest Capital Strategies",
        "license_number": "CFA-905112",
        "specializations": ["Peak Earning", "Tax-Loss Harvesting", "Concentrated Positions"],
        "bio": "Quant-leaning advisor focused on tax-efficient portfolio construction and unwinding concentrated stock positions.",
        "avatar_url": "https://randomuser.me/api/portraits/men/77.jpg",
        "is_verified": True,
    },
]


def seed_fake_wms() -> int:
    """Idempotently seed the wealth_managers table with demo entries.

    Creates one shadow user per WM (no usable password — just a placeholder
    so the FK constraint is satisfied) and a corresponding wealth_manager row.
    Returns the number of new wealth managers inserted.
    """
    with pg_cursor() as cur:
        cur.execute("SELECT COUNT(*) AS cnt FROM wealth_managers")
        existing = cur.fetchone()["cnt"]
        if existing >= len(_FAKE_WMS):
            return 0

        inserted = 0
        now = datetime.now(timezone.utc)
        for wm_data in _FAKE_WMS:
            cur.execute(
                "SELECT id FROM users WHERE email = %s",
                (wm_data["email"],),
            )
            existing_user = cur.fetchone()
            if existing_user:
                user_id = existing_user["id"]
            else:
                user_id = _gen_id("user")
                # Hash placeholder password — these accounts are not meant for
                # interactive login; the field exists to satisfy NOT NULL.
                cur.execute(
                    """INSERT INTO users (id, email, name, hashed_password, created_at,
                                          email_verified, profile_completed)
                       VALUES (%s, %s, %s, %s, %s, TRUE, TRUE)""",
                    (
                        user_id,
                        wm_data["email"],
                        wm_data["name"],
                        "!seed-no-login!",
                        now,
                    ),
                )

            cur.execute(
                "SELECT id FROM wealth_managers WHERE user_id = %s",
                (user_id,),
            )
            if cur.fetchone():
                continue

            wm_id = _gen_id("wm")
            cur.execute(
                """INSERT INTO wealth_managers
                   (id, user_id, firm_name, license_number, specializations, bio,
                    is_verified, is_active, avatar_url, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, TRUE, %s, %s)""",
                (
                    wm_id,
                    user_id,
                    wm_data["firm_name"],
                    wm_data["license_number"],
                    json.dumps(wm_data["specializations"]),
                    wm_data["bio"],
                    bool(wm_data["is_verified"]),
                    wm_data["avatar_url"],
                    now,
                ),
            )
            inserted += 1

        if inserted:
            logger.info(f"[cohort] seeded {inserted} demo wealth managers")
        return inserted
