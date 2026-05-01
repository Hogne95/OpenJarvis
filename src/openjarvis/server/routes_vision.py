"""Vision analysis and visual mission routes."""

from __future__ import annotations

import json
import os
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel


class VisionAnalyzeRequest(BaseModel):
    image_data_url: str
    note: Optional[str] = None
    label: Optional[str] = None


class VisionAnalyzeMultiRequest(BaseModel):
    images: list[dict[str, str]]
    note: Optional[str] = None
    label: Optional[str] = None


class VisionExtractRequest(BaseModel):
    image_data_url: str
    note: Optional[str] = None
    label: Optional[str] = None


class VisionExtractMultiRequest(BaseModel):
    images: list[dict[str, str]]
    note: Optional[str] = None
    label: Optional[str] = None


class VisionSuggestActionsRequest(BaseModel):
    images: list[dict[str, str]]
    note: Optional[str] = None
    label: Optional[str] = None


class VisionUiTargetsRequest(BaseModel):
    images: list[dict[str, str]]
    note: Optional[str] = None
    label: Optional[str] = None


class VisionUiActionPlanRequest(BaseModel):
    images: list[dict[str, str]]
    target_label: str
    target_detail: Optional[str] = None
    control_type: Optional[str] = None
    note: Optional[str] = None
    label: Optional[str] = None


class VisionUiVerifyRequest(BaseModel):
    images: list[dict[str, str]]
    target_label: str
    target_detail: Optional[str] = None
    control_type: Optional[str] = None
    desktop_intent: Optional[str] = None
    note: Optional[str] = None
    label: Optional[str] = None


class VisionQueryRequest(BaseModel):
    images: list[dict[str, str]]
    question: str
    note: Optional[str] = None
    label: Optional[str] = None
    history: list[dict[str, str]] = []


vision_router = APIRouter(prefix="/v1/vision", tags=["vision"])


@vision_router.post("/analyze")
async def vision_analyze(req: VisionAnalyzeRequest, request: Request):
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Vision analysis requires OPENAI_API_KEY")
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"openai package unavailable: {exc}") from exc

    prompt = (
        "You are JARVIS visual analysis. Reply in English only. "
        "Analyze the provided image and produce a concise operator brief with these sections: "
        "Summary, Important Details, Risks, Recommended Next Action. "
        "If the user's note gives extra context, incorporate it."
    )
    if req.note:
        prompt += f"\n\nUser context note: {req.note.strip()}"
    if req.label:
        prompt += f"\nVisual label: {req.label.strip()}"

    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": prompt},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Analyze this visual for my JARVIS HUD."},
                        {
                            "type": "image_url",
                            "image_url": {"url": req.image_data_url},
                        },
                    ],
                },
            ],
            temperature=0.2,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Vision analysis failed: {exc}") from exc

    content = ""
    choice = response.choices[0] if response.choices else None
    if choice and choice.message:
        content = (choice.message.content or "").strip()
    _update_visual_mission(
        request.app.state,
        phase="detect",
        status="active",
        summary=f"Visual analysis complete for {req.label or 'current visual'}.",
        next_step="Review the visual brief and decide whether to extract signals or ask a follow-up question.",
        result=content[:400],
        retry_hint="Re-run analysis with a clearer note or fresher capture if the summary feels incomplete.",
    )
    return {
        "content": content,
        "model": os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
        "label": req.label or "",
    }


@vision_router.post("/analyze-multi")
async def vision_analyze_multi(req: VisionAnalyzeMultiRequest, request: Request):
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Vision analysis requires OPENAI_API_KEY")
    if not req.images:
        raise HTTPException(status_code=400, detail="At least one image is required for multi-screen analysis")
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"openai package unavailable: {exc}") from exc

    prompt = (
        "You are JARVIS multi-screen visual analysis. Reply in English only. "
        "Analyze the provided images as parts of one desktop setup. "
        "Produce a concise operator brief with these sections: "
        "Overall Summary, Screen-by-Screen Notes, Cross-Screen Risks, Recommended Next Action. "
        "Reference individual screens by their labels when useful. "
        "If the user's note gives extra context, incorporate it."
    )
    if req.note:
        prompt += f"\n\nUser context note: {req.note.strip()}"
    if req.label:
        prompt += f"\nSession label: {req.label.strip()}"

    user_content: list[dict[str, Any]] = [
        {"type": "text", "text": "Analyze this full desktop setup for my JARVIS HUD."}
    ]
    for index, image in enumerate(req.images, start=1):
        label = (image.get("label") or f"Screen {index}").strip()
        user_content.append({"type": "text", "text": f"{label}"})
        user_content.append(
            {
                "type": "image_url",
                "image_url": {"url": image.get("image_data_url", "")},
            }
        )

    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": prompt},
                {
                    "role": "user",
                    "content": user_content,
                },
            ],
            temperature=0.2,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Vision analysis failed: {exc}") from exc

    content = ""
    choice = response.choices[0] if response.choices else None
    if choice and choice.message:
        content = (choice.message.content or "").strip()
    _update_visual_mission(
        request.app.state,
        phase="detect",
        status="active",
        summary=f"Multi-screen visual analysis complete for {len(req.images)} screen(s).",
        next_step="Review cross-screen risks and extract the next action or signal set.",
        result=content[:400],
        retry_hint="Capture all relevant monitors again if the setup changed or important context is missing.",
    )
    return {
        "content": content,
        "model": os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
        "label": req.label or "",
        "screen_count": len(req.images),
    }


@vision_router.post("/extract-text")
async def vision_extract_text(req: VisionExtractRequest):
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Vision text extraction requires OPENAI_API_KEY")
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"openai package unavailable: {exc}") from exc

    prompt = (
        "You are JARVIS OCR extraction. Reply in English only. "
        "Extract the visible text from the provided image as accurately as possible. "
        "Format the response with these sections: Summary, Extracted Text, Actionable Highlights. "
        "Preserve meaningful line breaks when useful. "
        "If the user's note gives extra context, use it to prioritize what to extract."
    )
    if req.note:
        prompt += f"\n\nUser context note: {req.note.strip()}"
    if req.label:
        prompt += f"\nVisual label: {req.label.strip()}"

    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": prompt},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Extract the visible text from this visual for my JARVIS HUD."},
                        {"type": "image_url", "image_url": {"url": req.image_data_url}},
                    ],
                },
            ],
            temperature=0.1,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Vision text extraction failed: {exc}") from exc

    content = ""
    choice = response.choices[0] if response.choices else None
    if choice and choice.message:
        content = (choice.message.content or "").strip()
    return {
        "content": content,
        "model": os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
        "label": req.label or "",
    }


@vision_router.post("/extract-text-multi")
async def vision_extract_text_multi(req: VisionExtractMultiRequest):
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Vision text extraction requires OPENAI_API_KEY")
    if not req.images:
        raise HTTPException(status_code=400, detail="At least one image is required for multi-screen text extraction")
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"openai package unavailable: {exc}") from exc

    prompt = (
        "You are JARVIS multi-screen OCR extraction. Reply in English only. "
        "Extract the visible text from the provided images as parts of one desktop setup. "
        "Format the response with these sections: Overall Summary, Screen-by-Screen Text, Actionable Highlights. "
        "Reference screens by label and preserve important line breaks when useful. "
        "If the user's note gives extra context, use it to prioritize extraction."
    )
    if req.note:
        prompt += f"\n\nUser context note: {req.note.strip()}"
    if req.label:
        prompt += f"\nSession label: {req.label.strip()}"

    user_content: list[dict[str, Any]] = [
        {"type": "text", "text": "Extract the visible text from this desktop setup for my JARVIS HUD."}
    ]
    for index, image in enumerate(req.images, start=1):
        label = (image.get("label") or f"Screen {index}").strip()
        user_content.append({"type": "text", "text": f"{label}"})
        user_content.append({"type": "image_url", "image_url": {"url": image.get("image_data_url", "")}})

    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.1,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Vision text extraction failed: {exc}") from exc

    content = ""
    choice = response.choices[0] if response.choices else None
    if choice and choice.message:
        content = (choice.message.content or "").strip()
    return {
        "content": content,
        "model": os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
        "label": req.label or "",
        "screen_count": len(req.images),
    }


@vision_router.post("/suggest-actions")
async def vision_suggest_actions(req: VisionSuggestActionsRequest, request: Request):
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Vision action suggestions require OPENAI_API_KEY")
    if not req.images:
        raise HTTPException(status_code=400, detail="At least one image is required for vision action suggestions")
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"openai package unavailable: {exc}") from exc

    prompt = (
        "You are JARVIS visual action planning. Reply in JSON only. "
        "Analyze the provided image or screen set and return an object with one key: actions. "
        "actions must be an array of up to 3 objects with keys: title, detail, prompt, priority, desktop_intent. "
        "title should be short. detail should explain the observation. "
        "prompt should be a concrete next-step command-deck prompt in English. "
        "priority must be an integer from 1 to 100. "
        "desktop_intent should be a short, safe desktop-control command only when there is a clear next computer action; otherwise return an empty string."
    )
    if req.note:
        prompt += f"\n\nUser context note: {req.note.strip()}"
    if req.label:
        prompt += f"\nSession label: {req.label.strip()}"

    user_content: list[dict[str, Any]] = [
        {"type": "text", "text": "Suggest the next operator actions for this JARVIS visual context."}
    ]
    for index, image in enumerate(req.images, start=1):
        label = (image.get("label") or f"Screen {index}").strip()
        user_content.append({"type": "text", "text": f"{label}"})
        user_content.append({"type": "image_url", "image_url": {"url": image.get("image_data_url", "")}})

    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.2,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Vision action suggestion failed: {exc}") from exc

    content = ""
    choice = response.choices[0] if response.choices else None
    if choice and choice.message:
        content = (choice.message.content or "").strip()

    import json

    actions: list[dict[str, Any]] = []
    try:
        parsed = json.loads(content)
        raw_actions = parsed.get("actions", []) if isinstance(parsed, dict) else []
        if isinstance(raw_actions, list):
            for item in raw_actions[:3]:
                if not isinstance(item, dict):
                    continue
                actions.append(
                    {
                        "title": str(item.get("title", "")).strip() or "Visual Action",
                        "detail": str(item.get("detail", "")).strip(),
                        "prompt": str(item.get("prompt", "")).strip(),
                        "priority": int(item.get("priority", 50)),
                        "desktop_intent": str(item.get("desktop_intent", "")).strip(),
                    }
                )
    except Exception:
        if content:
            actions.append(
                {
                    "title": "Visual Follow-up",
                    "detail": "JARVIS generated a freeform follow-up suggestion.",
                    "prompt": content,
                    "priority": 50,
                    "desktop_intent": "",
                }
            )

    top_action = actions[0] if actions else None
    _update_visual_mission(
        request.app.state,
        phase="plan" if top_action else "detect",
        status="active" if top_action else "idle",
        summary=(
            f"Visual action suggestions ready for {req.label or 'current visual'}."
            if top_action
            else f"No strong visual action suggestions for {req.label or 'current visual'}."
        ),
        next_step=(top_action.get("title", "") if top_action else "Ask a focused visual question or extract signals."),
        result=(top_action.get("detail", "") if top_action else content[:400]),
        retry_hint="Try a clearer capture or add a stronger context note if the next action is still ambiguous.",
    )
    return {
        "actions": actions,
        "model": os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
        "label": req.label or "",
        "screen_count": len(req.images),
    }


@vision_router.post("/ui-targets")
async def vision_extract_ui_targets(req: VisionUiTargetsRequest):
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Vision UI target extraction requires OPENAI_API_KEY")
    if not req.images:
        raise HTTPException(status_code=400, detail="At least one image is required for UI target extraction")
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"openai package unavailable: {exc}") from exc

    prompt = (
        "You are JARVIS UI target extraction. Reply in JSON only. "
        "Analyze the provided image or screen set and return an object with one key: targets. "
        "targets must be an array of up to 5 objects with keys: label, detail, control_type, confidence, prompt, desktop_intent. "
        "label should be a short human-readable name for the likely control or interface target. "
        "detail should explain what the target appears to do or why it matters. "
        "control_type must be one of button, field, menu, panel, tab, link, alert, editor, window, or other. "
        "confidence must be an integer from 1 to 100. "
        "prompt should be a concrete next-step command-deck prompt in English. "
        "desktop_intent should be a short, safe desktop-control command only when there is a clear next computer action; otherwise return an empty string. "
        "Do not invent pixel coordinates or overstate certainty when the target is ambiguous."
    )
    if req.note:
        prompt += f"\n\nUser context note: {req.note.strip()}"
    if req.label:
        prompt += f"\nSession label: {req.label.strip()}"

    user_content: list[dict[str, Any]] = [
        {"type": "text", "text": "Identify the most relevant UI targets in this JARVIS visual context."}
    ]
    for index, image in enumerate(req.images, start=1):
        label = (image.get("label") or f"Screen {index}").strip()
        user_content.append({"type": "text", "text": f"{label}"})
        user_content.append({"type": "image_url", "image_url": {"url": image.get("image_data_url", "")}})

    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.15,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Vision UI target extraction failed: {exc}") from exc

    content = ""
    choice = response.choices[0] if response.choices else None
    if choice and choice.message:
        content = (choice.message.content or "").strip()

    targets: list[dict[str, Any]] = []
    try:
        parsed = json.loads(content)
        raw_targets = parsed.get("targets", []) if isinstance(parsed, dict) else []
        if isinstance(raw_targets, list):
            for item in raw_targets[:5]:
                if not isinstance(item, dict):
                    continue
                control_type = str(item.get("control_type", "other")).strip().lower() or "other"
                if control_type not in {"button", "field", "menu", "panel", "tab", "link", "alert", "editor", "window", "other"}:
                    control_type = "other"
                try:
                    confidence = max(1, min(int(item.get("confidence", 50)), 100))
                except Exception:
                    confidence = 50
                targets.append(
                    {
                        "label": str(item.get("label", "")).strip() or "UI Target",
                        "detail": str(item.get("detail", "")).strip(),
                        "control_type": control_type,
                        "confidence": confidence,
                        "prompt": str(item.get("prompt", "")).strip(),
                        "desktop_intent": str(item.get("desktop_intent", "")).strip(),
                    }
                )
    except Exception:
        if content:
            targets.append(
                {
                    "label": "Visual Target",
                    "detail": content,
                    "control_type": "other",
                    "confidence": 40,
                    "prompt": content,
                    "desktop_intent": "",
                }
            )

    return {
        "targets": targets,
        "model": os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
        "label": req.label or "",
        "screen_count": len(req.images),
    }


@vision_router.post("/ui-action-plan")
async def vision_plan_ui_action(req: VisionUiActionPlanRequest, request: Request):
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Vision UI planning requires OPENAI_API_KEY")
    if not req.images:
        raise HTTPException(status_code=400, detail="At least one image is required for UI planning")
    if not req.target_label.strip():
        raise HTTPException(status_code=400, detail="target_label is required for UI planning")
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"openai package unavailable: {exc}") from exc

    prompt = (
        "You are JARVIS UI interaction planning. Reply in JSON only. "
        "Analyze the provided image or screen set and create a safe operator plan for the requested UI target. "
        "Return an object with keys: summary, steps, prompt, desktop_intent. "
        "summary should be one short sentence. "
        "steps must be an array of 2 to 5 concise English strings describing the safest likely interaction sequence. "
        "prompt should be a concrete next-step command-deck prompt in English. "
        "desktop_intent should be a short, safe desktop-control command only when there is a clear first action; otherwise return an empty string. "
        "Do not invent coordinates, hidden controls, or certainty you do not have."
    )
    if req.note:
        prompt += f"\n\nUser context note: {req.note.strip()}"
    if req.label:
        prompt += f"\nSession label: {req.label.strip()}"

    target_detail = (req.target_detail or "").strip()
    control_type = (req.control_type or "other").strip()
    user_content: list[dict[str, Any]] = [
        {
            "type": "text",
            "text": (
                f"Plan the safest likely interaction for this UI target.\n"
                f"Target: {req.target_label.strip()}\n"
                f"Control type: {control_type}\n"
                f"Detail: {target_detail or 'No extra detail provided.'}"
            ),
        }
    ]
    for index, image in enumerate(req.images, start=1):
        label = (image.get("label") or f"Screen {index}").strip()
        user_content.append({"type": "text", "text": f"{label}"})
        user_content.append({"type": "image_url", "image_url": {"url": image.get("image_data_url", "")}})

    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.15,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Vision UI planning failed: {exc}") from exc

    content = ""
    choice = response.choices[0] if response.choices else None
    if choice and choice.message:
        content = (choice.message.content or "").strip()

    summary = ""
    steps: list[str] = []
    plan_prompt = ""
    desktop_intent = ""
    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            summary = str(parsed.get("summary", "")).strip()
            raw_steps = parsed.get("steps", [])
            if isinstance(raw_steps, list):
                steps = [str(item).strip() for item in raw_steps[:5] if str(item).strip()]
            plan_prompt = str(parsed.get("prompt", "")).strip()
            desktop_intent = str(parsed.get("desktop_intent", "")).strip()
    except Exception:
        if content:
            summary = "JARVIS generated a freeform UI interaction plan."
            steps = [content]
            plan_prompt = content

    _update_visual_mission(
        request.app.state,
        phase="plan",
        status="active",
        summary=summary or f"UI interaction plan ready for {req.target_label.strip()}.",
        next_step=(steps[0] if steps else "Review the interaction plan before staging a desktop action."),
        result=(plan_prompt or "\n".join(steps))[:400],
        retry_hint="Verify the target again if the UI changed or the plan feels uncertain.",
    )
    return {
        "summary": summary or f"Interaction plan ready for {req.target_label.strip()}.",
        "steps": steps,
        "prompt": plan_prompt,
        "desktop_intent": desktop_intent,
        "model": os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
        "label": req.label or "",
        "target_label": req.target_label.strip(),
        "screen_count": len(req.images),
    }


@vision_router.post("/ui-verify")
async def vision_verify_ui_target(req: VisionUiVerifyRequest):
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Vision UI verification requires OPENAI_API_KEY")
    if not req.images:
        raise HTTPException(status_code=400, detail="At least one image is required for UI verification")
    if not req.target_label.strip():
        raise HTTPException(status_code=400, detail="target_label is required for UI verification")
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"openai package unavailable: {exc}") from exc

    prompt = (
        "You are JARVIS UI verification. Reply in JSON only. "
        "Analyze the provided image or screen set and verify how safe it is to interact with the requested UI target. "
        "Return an object with keys: summary, confidence, verification_checks, evidence, risk_level. "
        "confidence must be an integer from 1 to 100. "
        "verification_checks must be an array of 2 to 5 concise checks the operator should confirm before acting. "
        "evidence must be an array of 1 to 4 short observations explaining what in the image supports the target guess. "
        "risk_level must be low, medium, or high. "
        "Do not invent coordinates, hidden controls, or certainty you do not have."
    )
    if req.note:
        prompt += f"\n\nUser context note: {req.note.strip()}"
    if req.label:
        prompt += f"\nSession label: {req.label.strip()}"

    user_content: list[dict[str, Any]] = [
        {
            "type": "text",
            "text": (
                f"Verify this UI target before action.\n"
                f"Target: {req.target_label.strip()}\n"
                f"Control type: {(req.control_type or 'other').strip()}\n"
                f"Detail: {(req.target_detail or '').strip() or 'No extra detail provided.'}\n"
                f"Planned desktop action: {(req.desktop_intent or '').strip() or 'None'}"
            ),
        }
    ]
    for index, image in enumerate(req.images, start=1):
        label = (image.get('label') or f'Screen {index}').strip()
        user_content.append({"type": "text", "text": f"{label}"})
        user_content.append({"type": "image_url", "image_url": {"url": image.get("image_data_url", "")}})

    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.1,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Vision UI verification failed: {exc}") from exc

    content = ""
    choice = response.choices[0] if response.choices else None
    if choice and choice.message:
        content = (choice.message.content or "").strip()

    summary = ""
    confidence = 50
    verification_checks: list[str] = []
    evidence: list[str] = []
    risk_level = "medium"
    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            summary = str(parsed.get("summary", "")).strip()
            try:
                confidence = max(1, min(int(parsed.get("confidence", 50)), 100))
            except Exception:
                confidence = 50
            raw_checks = parsed.get("verification_checks", [])
            if isinstance(raw_checks, list):
                verification_checks = [str(item).strip() for item in raw_checks[:5] if str(item).strip()]
            raw_evidence = parsed.get("evidence", [])
            if isinstance(raw_evidence, list):
                evidence = [str(item).strip() for item in raw_evidence[:4] if str(item).strip()]
            risk_value = str(parsed.get("risk_level", "medium")).strip().lower()
            if risk_value in {"low", "medium", "high"}:
                risk_level = risk_value
    except Exception:
        if content:
            summary = content

    return {
        "summary": summary or f"Verification ready for {req.target_label.strip()}.",
        "confidence": confidence,
        "verification_checks": verification_checks,
        "evidence": evidence,
        "risk_level": risk_level,
        "model": os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
        "label": req.label or "",
        "target_label": req.target_label.strip(),
        "screen_count": len(req.images),
    }


@vision_router.post("/query")
async def vision_query(req: VisionQueryRequest, request: Request):
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Visual question answering requires OPENAI_API_KEY")
    if not req.images:
        raise HTTPException(status_code=400, detail="At least one image is required for visual question answering")
    question = req.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="question is required for visual question answering")
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"openai package unavailable: {exc}") from exc

    prompt = (
        "You are JARVIS visual question answering. Reply in English only. "
        "Answer the user's question about the provided image or screen set. "
        "Be concise but useful. If the answer is uncertain, say what is visible and what still needs confirmation. "
        "End with one short 'Next step' line when there is an obvious operator follow-up."
    )
    if req.note:
        prompt += f"\n\nUser context note: {req.note.strip()}"
    if req.label:
        prompt += f"\nSession label: {req.label.strip()}"
    history_lines: list[str] = []
    for item in req.history[:6]:
        previous_question = (item.get("question") or "").strip()
        previous_answer = (item.get("answer") or "").strip()
        if not previous_question or not previous_answer:
            continue
        history_lines.append(f"Q: {previous_question}\nA: {previous_answer}")
    if history_lines:
        prompt += "\n\nRecent visual conversation context:\n" + "\n\n".join(history_lines)

    user_content: list[dict[str, Any]] = [
        {"type": "text", "text": f"Question: {question}"},
    ]
    for index, image in enumerate(req.images, start=1):
        label = (image.get("label") or f"Screen {index}").strip()
        user_content.append({"type": "text", "text": f"{label}"})
        user_content.append({"type": "image_url", "image_url": {"url": image.get("image_data_url", "")}})

    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.2,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Visual question answering failed: {exc}") from exc

    content = ""
    choice = response.choices[0] if response.choices else None
    if choice and choice.message:
        content = (choice.message.content or "").strip()

    _update_visual_mission(
        request.app.state,
        phase="verify",
        status="active",
        summary=f"Visual question answered for {req.label or 'current visual'}.",
        next_step="Use the answer to decide the next operator action or ask a tighter follow-up.",
        result=content[:400],
        retry_hint="Ask a narrower follow-up question if the answer is still uncertain.",
    )
    return {
        "answer": content,
        "question": question,
        "model": os.environ.get("OPENJARVIS_VISION_MODEL", "gpt-4o-mini"),
        "label": req.label or "",
        "screen_count": len(req.images),
        "history_used": len(history_lines),
    }


def _update_visual_mission(
    app_state: Any,
    *,
    phase: str,
    status: str,
    summary: str,
    next_step: str = "",
    result: str = "",
    retry_hint: str = "",
) -> dict[str, Any] | None:
    operator_memory = getattr(app_state, "operator_memory", None)
    if operator_memory is None:
        return None
    return operator_memory.update_mission(
        "visual-mission",
        {
            "title": "Visual Mission",
            "domain": "visual",
            "status": status,
            "phase": phase,
            "summary": summary,
            "next_step": next_step,
            "result": result,
            "retry_hint": retry_hint,
            "result_data": {
                "summary": summary,
                "result": result,
                "phase": phase,
                "status": status,
            },
            "next_action": {
                "kind": "prompt",
                "content": result or next_step or summary,
                "label": "Visual Follow-up",
            },
        },
    )
