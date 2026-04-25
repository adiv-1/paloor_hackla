"""
Financial health scoring engine.
Computes a holistic "financial health" score (0-100) based on:
  - Document completeness
  - Asset diversification
  - Profile completeness
  - Goal coverage
Inspired by Whoop / Oura Ring readiness scores.
"""

from __future__ import annotations
from typing import Optional
from auth import get_user_record


def compute_health(user_id: str, account_docs: list, assets: list, classes: list) -> dict:
    """Return a full financial health report."""

    user = get_user_record(user_id)

    # ---------- 1. Document Score (0-30) ----------
    total_docs_possible = max(len(account_docs), 1)
    docs_uploaded = sum(1 for d in account_docs if d.get("status") == "uploaded")
    doc_score = round((docs_uploaded / total_docs_possible) * 30)

    # ---------- 2. Asset Diversification (0-25) ----------
    unique_classes = set()
    for a in assets:
        cid = a.get("class_id") or a.get("classId")
        if cid:
            unique_classes.add(cid)
    total_classes = max(len(classes), 1)
    div_ratio = min(len(unique_classes) / max(total_classes, 1), 1.0)
    diversification_score = round(div_ratio * 25)

    # ---------- 3. Profile Completeness (0-20) ----------
    profile_fields = [
        "age", "gender", "occupation", "annual_income",
        "net_worth_estimate", "risk_tolerance", "state",
    ]
    profile_filled = 0
    if user:
        for f in profile_fields:
            val = getattr(user, f, None)
            if val is not None and val != "":
                profile_filled += 1
    profile_score = round((profile_filled / len(profile_fields)) * 20)

    # ---------- 4. Goal & Planning Score (0-25) ----------
    goal_score = 0
    if user:
        goals = getattr(user, "financial_goals", None) or []
        if len(goals) >= 1:
            goal_score += 8
        if len(goals) >= 3:
            goal_score += 7
        risk = getattr(user, "risk_tolerance", None)
        if risk:
            goal_score += 5
        income = getattr(user, "annual_income", None)
        if income:
            goal_score += 5

    # ---------- Total ----------
    total = doc_score + diversification_score + profile_score + goal_score
    total = min(total, 100)

    # Determine grade
    if total >= 85:
        grade = "Excellent"
        color = "#10b981"
    elif total >= 70:
        grade = "Good"
        color = "#22c55e"
    elif total >= 50:
        grade = "Fair"
        color = "#f59e0b"
    elif total >= 30:
        grade = "Needs Work"
        color = "#f97316"
    else:
        grade = "Getting Started"
        color = "#ef4444"

    # Breakdown
    breakdown = [
        {
            "label": "Documents",
            "score": doc_score,
            "max": 30,
            "tip": f"{docs_uploaded}/{total_docs_possible} documents uploaded"
                   if docs_uploaded < total_docs_possible
                   else "All documents uploaded!",
        },
        {
            "label": "Diversification",
            "score": diversification_score,
            "max": 25,
            "tip": f"Assets across {len(unique_classes)} of {total_classes} classes"
                   if len(unique_classes) < total_classes
                   else "Great asset diversity!",
        },
        {
            "label": "Profile",
            "score": profile_score,
            "max": 20,
            "tip": f"{profile_filled}/{len(profile_fields)} fields complete"
                   if profile_filled < len(profile_fields)
                   else "Profile complete!",
        },
        {
            "label": "Goals & Planning",
            "score": goal_score,
            "max": 25,
            "tip": "Set financial goals and risk tolerance to improve"
                   if goal_score < 15
                   else "Clear financial direction!",
        },
    ]

    # Insights
    insights = []
    if docs_uploaded == 0:
        insights.append("Upload your first document to jumpstart your score.")
    if len(unique_classes) <= 1:
        insights.append("Diversify by adding assets in different classes.")
    if profile_filled < 4:
        insights.append("Complete your profile to unlock personalized insights.")
    if not (user and getattr(user, "financial_goals", None)):
        insights.append("Set financial goals to get a clearer roadmap.")
    if total >= 70 and not insights:
        insights.append("You're in great shape. Keep documents up to date!")

    return {
        "score": total,
        "grade": grade,
        "color": color,
        "breakdown": breakdown,
        "insights": insights,
        "stats": {
            "documents_uploaded": docs_uploaded,
            "total_documents": total_docs_possible,
            "asset_classes_used": len(unique_classes),
            "total_asset_classes": total_classes,
            "total_assets": len(assets),
        },
    }
