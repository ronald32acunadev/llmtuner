"""Send one code request to the local model (LM Studio or Ollama) and save its answer.

Any agent can run it when its MCP tool times out or cannot turn reasoning off:

    python3 scripts/ask_local_llm.py --user request.md --out answer.md [--code-out file.py]

The system message is the project rules in .agents/local-llm-prompt-rules.md, preceded by --system when given.
"""

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

RULES = Path(__file__).resolve().parents[1] / ".agents/local-llm-prompt-rules.md"
PROVIDERS = {"lmstudio": "http://127.0.0.1:1234", "ollama": "http://127.0.0.1:11434"}


def loaded_model(provider: str, base: str) -> str:
    """Return the name of the currently loaded model."""
    if provider == "lmstudio":
        return "loaded"
    try:
        with urllib.request.urlopen(f"{base}/api/ps", timeout=10) as r:
            data = json.loads(r.read().decode("utf-8"))
            models = data.get("models", [])
            if not models:
                raise SystemExit("Ollama has no model loaded")
            return models[0]["name"]
    except urllib.error.URLError as e:
        raise SystemExit(f"Cannot reach {base}: {e.reason}")


def system_message(extra: str | None) -> str:
    """Construct the system prompt from rules and optional extra text."""
    rules_text = ""
    if RULES.exists():
        rules_text = RULES.read_text(encoding="utf-8")

    if extra:
        return f"{extra}\n\n{rules_text}" if rules_text else extra
    return rules_text


def first_code_block(text: str) -> str | None:
    """Extract the content of the first fenced code block."""
    # A fence closes only at the start of a line, so ``` inside the code (a regex, a docstring) is kept.
    match = re.search(r"^```[\w+-]*\n(.*?)\n```[ \t]*$", text, re.DOTALL | re.MULTILINE)
    return match.group(1) if match else None


def ask(base: str, model: str, system: str, user: str, think: bool, timeout: float) -> dict:
    """Send a chat completion request to the local LLM."""
    url = f"{base}/v1/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user}
        ],
        "temperature": 0.2,
        "stream": False
    }
    if not think:
        payload["reasoning_effort"] = "none"

    try:
        req = urllib.request.Request(url, method="POST", data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.URLError as e:
        raise SystemExit(f"Cannot reach {base}: {e.reason}")


def main(argv: list[str] | None = None) -> int:
    """Parse arguments and execute the LLM request."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--user", required=True)
    parser.add_argument("--system")
    parser.add_argument("--out", required=True)
    parser.add_argument("--code-out")
    parser.add_argument("--provider", choices=["lmstudio", "ollama"], default="lmstudio")
    parser.add_argument("--think", action="store_true")
    parser.add_argument("--timeout", type=float, default=1800)
    args = parser.parse_args(argv)

    user_text = Path(args.user).read_text(encoding="utf-8")
    extra_sys = Path(args.system).read_text(encoding="utf-8") if args.system else None
    sys_prompt = system_message(extra_sys)

    base = PROVIDERS[args.provider]
    model = loaded_model(args.provider, base)

    start = time.monotonic()
    answer = ask(base, model, sys_prompt, user_text, args.think, args.timeout)
    seconds = time.monotonic() - start

    content = answer["choices"][0]["message"]["content"]
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(content, encoding="utf-8")

    if args.code_out:
        code = first_code_block(content)
        if code is None:
            print("No code block in the answer", file=sys.stderr)
            return 1
        code_path = Path(args.code_out)
        code_path.parent.mkdir(parents=True, exist_ok=True)
        code_path.write_text(code + "\n", encoding="utf-8")

    usage = answer.get("usage", {})
    p = usage.get("prompt_tokens", 0)
    c = usage.get("completion_tokens", 0)
    print(f"model={answer['model']} seconds={seconds:.0f} prompt_tokens={p} completion_tokens={c} tok_per_s={c / seconds:.1f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
