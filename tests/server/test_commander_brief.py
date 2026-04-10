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


def test_commander_brief_uses_improvement_opportunities_when_present():
    brief = build_commander_brief(
        analytics={
            "signals": {"urgent_reviews": 0},
            "active_missions": [],
            "blocked_missions": [],
            "top_lessons": [],
            "focus_recommendations": [],
            "review_items": [],
            "improvement_opportunities": [
                "Voice work is blocking repeatedly. Add a stronger checklist or recovery routine there."
            ],
            "friction_brief": {
                "summary": "Voice work is stalling repeatedly.",
                "root_cause": "The same work domain has blocked multiple times, which suggests a missing recovery routine.",
                "pressure_points": ["2 blocked missions need recovery."],
                "recommended_focus": "Voice work is blocking repeatedly. Add a stronger checklist or recovery routine there.",
            },
        },
        awareness={"mode": {"level": "healthy", "reasons": []}, "agents": {"recent_failures": []}},
        profile={},
    )

    assert brief["recommendation"].startswith("Voice work is blocking repeatedly")
    assert brief["friction_summary"] == "Voice work is stalling repeatedly."
    assert brief["root_cause"].startswith("The same work domain has blocked")
    assert brief["user_temperament"]
    assert brief["command_posture"]
    assert brief["guidance_note"]
    assert "User temperament:" in brief["planner_prompt"]
    assert "Command posture:" in brief["planner_prompt"]
    assert any(risk.startswith("Pressure point:") for risk in brief["risks"])
    assert any(item["id"] == "improvement-opportunity" for item in brief["queue"])
