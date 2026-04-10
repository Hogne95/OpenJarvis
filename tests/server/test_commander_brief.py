from openjarvis.assistant.commander import build_coding_commander_brief, build_commander_brief


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
    assert brief["queue"][0]["execution_lane"] == "execute"
    assert "recovery step" in brief["queue"][0]["verification_signal"]
    assert "voice unavailable" in brief["risks"]
    assert [item["phase"] for item in brief["execution_plan"]] == ["plan", "execute", "verify", "report"]
    assert "Recommendation: Unblock Repair voice loop first." in brief["execution_summary"]
    assert "Risk: voice unavailable" in brief["execution_summary"]
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
    assert brief["queue"][0]["execution_lane"] == "report"
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


def test_commander_brief_prioritizes_coding_repo_stabilization_when_repo_is_not_ready():
    brief = build_commander_brief(
        analytics={
            "signals": {"urgent_reviews": 0},
            "active_missions": [],
            "blocked_missions": [],
            "top_lessons": [],
            "focus_recommendations": [],
            "review_items": [],
            "coding_repos": [
                {
                    "key": "C:/repo",
                    "title": "OpenJarvis",
                    "preferred_verification_commands": ["python -m pytest tests/test_smoke.py -q"],
                    "repeated_failures": ["python -m pytest tests/test_smoke.py -q: smoke test failed after the last patch"],
                }
            ],
        },
        awareness={
            "mode": {"level": "healthy", "reasons": []},
            "agents": {"recent_failures": []},
            "workspace": {
                "available": True,
                "active_root": "C:/repo",
                "dirty": True,
                "staged_count": 2,
                "unstaged_count": 1,
                "commit_ready": False,
                "has_upstream": True,
                "behind_count": 0,
            },
        },
        profile={"autonomy_preference": "high initiative"},
    )

    assert brief["recommendation"] == "Stabilize OpenJarvis before broader coding work."
    assert brief["best_next_step"] == "Run python -m pytest tests/test_smoke.py -q and review the repo state before the next coding handoff."
    assert any(item["id"] == "coding-repo-recovery" for item in brief["queue"])
    coding_item = next(item for item in brief["queue"] if item["id"] == "coding-repo-recovery")
    assert coding_item["action_hint"] == "planner_handoff"
    assert coding_item["execution_lane"] == "verify"
    assert coding_item["verification_signal"] == "python -m pytest tests/test_smoke.py -q"
    assert any(risk.startswith("Workspace:") for risk in brief["risks"])
    assert any(risk.startswith("Coding memory:") for risk in brief["risks"])


def test_build_coding_commander_brief_uses_repo_state_and_repo_memory():
    brief = build_coding_commander_brief(
        repo_summary={
            "root": "C:/repo",
            "branch": "codex/test",
            "dirty": True,
            "staged_count": 2,
            "unstaged_count": 1,
            "ahead_count": 0,
            "behind_count": 0,
            "has_upstream": True,
            "commit_ready": True,
            "push_ready": False,
            "changed_files": ["src/app.py"],
        },
        repo_memory={
            "key": "C:/repo",
            "title": "OpenJarvis",
            "preferred_verification_commands": ["python -m pytest tests/test_smoke.py -q"],
            "repeated_failures": ["python -m pytest tests/test_smoke.py -q: smoke test failed after the last patch"],
            "common_pitfalls": ["Skipping the smoke test hides fast regressions."],
            "convention_notes": "Run the smoke test before broader validation.",
            "workflow_notes": "Keep patch scope small before commit.",
        },
        profile={"autonomy_preference": "high initiative"},
    )

    assert brief["headline"] == "Coding command brief for OpenJarvis."
    assert brief["recommendation"] == "Stabilize OpenJarvis on codex/test before shipping more code."
    assert brief["best_next_step"] == "Run python -m pytest tests/test_smoke.py -q, then decide whether the repo is ready to commit or needs one more patch pass."
    assert brief["preferred_checks"] == ["python -m pytest tests/test_smoke.py -q"]
    assert [item["phase"] for item in brief["phases"]] == ["assess", "patch", "verify", "report"]
    assert any(risk.startswith("Coding memory:") for risk in brief["risks"])
    assert "Coding commander directive." in brief["planner_prompt"]
