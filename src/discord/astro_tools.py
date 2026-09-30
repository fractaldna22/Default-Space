"""Parse AstroOo's hidden inline tool requests without leaking them into replies."""

from dataclasses import dataclass
import json
import re


@dataclass
class ToolCall:
    name: str
    arguments: dict
    error: str = ""


def extract_tools(text: str) -> tuple[str, list[ToolCall]]:
    calls: list[ToolCall] = []
    clean: list[str] = []
    cursor = 0
    while match := re.search(r"/tool\s*\[", text[cursor:], re.IGNORECASE):
        start = cursor + match.start()
        body_start = cursor + match.end()
        clean.append(text[cursor:start])
        depth, quote, escaped = 1, False, False
        end = body_start
        while end < len(text) and depth:
            char = text[end]
            if escaped:
                escaped = False
            elif quote and char == "\\":
                escaped = True
            elif char == '"':
                quote = not quote
            elif not quote:
                depth += (char == "[") - (char == "]")
            end += 1
        body = text[body_start:end - 1] if depth == 0 else text[body_start:]
        name, separator, argument_text = body.partition(":")
        try:
            if not separator or depth:
                raise ValueError("Unclosed or missing tool arguments")
            argument_text = argument_text.strip()
            if not argument_text.startswith("{"):
                argument_text = "{" + argument_text + "}"
            arguments = json.loads(argument_text)
            if not isinstance(arguments, dict):
                raise ValueError("Tool arguments must be an object")
            name = name.strip().lower()
            if name == "dm" and len(arguments) == 1 and "user_id" not in arguments:
                user_id, message = next(iter(arguments.items()))
                arguments = {"user_id": user_id, "message": message}
            calls.append(ToolCall(name, arguments))
        except (ValueError, json.JSONDecodeError) as error:
            calls.append(ToolCall(name.strip().lower(), {}, str(error)))
        cursor = end
    clean.append(text[cursor:])
    result = "".join(clean)
    result = re.sub(r"```(?:\w+)?\s*```", "", result)
    # Also hide an unfinished directive when output stops before its opening bracket.
    if trailing := re.search(r"/tool\b", result, re.IGNORECASE):
        result = result[:trailing.start()]
        calls.append(ToolCall("invalid", {}, "Incomplete tool directive"))
    return result.strip(), calls


def discord_user_id(value: object) -> int | None:
    match = re.fullmatch(r"(?:<@!?(\d{15,22})>|(\d{15,22}))", str(value).strip())
    return int(match[1] or match[2]) if match else None


TOOL_INSTRUCTIONS = """
Hidden tools (JSON): /tool[dm: "USER_ID":"message"] sends a DM;
/tool[react: {"message_id":"ID", "emoji":"🔥"}] reacts (omit message_id for this message);
/tool[lookup_user: {"name":"name"}] resolves IDs; /tool[recall_dm: {"query":"phrase"}] reads Josh's DM log.
Tool directives execute privately and never belong in visible or spoken replies. Wait for tool results before claiming success.
Mention people as <@USER_ID>; use supplied IDs, never invent them. Reactions in context are actual Discord feedback.
""".strip()
