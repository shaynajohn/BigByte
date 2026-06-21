from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from typing import Any

GROUP_SUBSCRIBERS: dict[str, set[asyncio.Queue[str]]] = defaultdict(set)


def encode_event(event_type: str, data: dict[str, Any]) -> str:
    return json.dumps({"type": event_type, "data": data})


async def publish_group_event(group_id: str, event_type: str, data: dict[str, Any]) -> None:
    message = encode_event(event_type, data)
    for queue in list(GROUP_SUBSCRIBERS.get(group_id, set())):
        await queue.put(message)


def notify_group_event(group_id: str, event_type: str, data: dict[str, Any]) -> None:
    """Push an event from sync FastAPI handlers (uses put_nowait)."""
    message = encode_event(event_type, data)
    for queue in list(GROUP_SUBSCRIBERS.get(group_id, set())):
        try:
            queue.put_nowait(message)
        except asyncio.QueueFull:
            pass


def subscribe(group_id: str) -> asyncio.Queue[str]:
    queue: asyncio.Queue[str] = asyncio.Queue()
    GROUP_SUBSCRIBERS[group_id].add(queue)
    return queue


def unsubscribe(group_id: str, queue: asyncio.Queue[str]) -> None:
    GROUP_SUBSCRIBERS.get(group_id, set()).discard(queue)
