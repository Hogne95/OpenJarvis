from openjarvis.assistant.commander import build_commander_brief


def test_commander_brief_prioritizes_blocked_mission():
    brief = build_commander_brief(
        analytics={
            "signals": {"urgent_reviews": 0},
            "active_missions": [],
            "blocked_missions": [
                {
                    "id": "mission-a",
                    "title": "Repair voice loop",
                    "status": "blocked",
                    "phase": "retry",
                    "next_step": "Inspect the latest interruption failure and patch cleanup.",
                }
            ],
            "top_lessons": [],
            "focus_recommendations": ["Advance the active mission."],
            "review_items": [],
        },
        awareness={
            "mode": {"level": "degraded", "reasons": ["voice unavailable"]},
            "agents": {"recent_failures": []},
        },
        profile={"autonomy_preference": "high initiative", "decisiveness_preference": "recommend clearly"},
    )

    assert brief["recommendation"] == "Unblock Repair voice loop first."
    assert brief["best_next_step"] == "Inspect the latest interruption failure and patch cleanup."
    assert brief["queue"][0]["action_hint"] == "planner_handoff"
    assert "voice unavailable" in brief["risks"]
    assert [item["phase"] for item in brief["execution_plan"]] == ["plan", "execute", "verify", "report"]
    assert "Commander mode directive." in brief["planner_prompt"]


def test_commander_brief_falls_back_to_review_queue():
    brief = build_commander_brief(
        analytics={
            "signals": {"urgent_reviews": 0},
            "active_missions": [],
            "blocked_missions": [],
            "top_lessons": [],
            "focus_recommendations": [],
            "review_items": [
                {
                    "id": "review-1",
                    "label": "Response quality",
                    "summary": "A recent answer felt too passive.",
                    "status": "open",
                }
            ],
        },
        awareness={"mode": {"level": "healthy", "reasons": []}, "agents": {"recent_failures": []}},
        profile={},
    )

    assert brief["queue"][0]["id"] == "review-review-1"
    assert brief["queue"][0]["action_hint"] == "open_system"
    assert brief["risks"][0] == "Review queue: A recent answer felt too passive."
    assert brief["execution_plan"][0]["phase"] == "plan"
