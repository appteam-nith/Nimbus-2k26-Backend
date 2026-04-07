import os
import subprocess
from dotenv import load_dotenv
from openai import OpenAI
from rich.console import Console
from rich.panel import Panel
from prompt_toolkit import prompt

load_dotenv()
console = Console()

client = OpenAI(
    api_key=os.getenv("FEATHERLESS_API_KEY"),
    base_url="https://api.featherless.ai/v1"
)

MODEL = "TeichAI/Qwen3-14B-Claude-4.5-Opus-High-Reasoning-Distill"

# ---------- MEMORY ----------
memory = []

# ---------- FILE TOOLS ----------

def read_file(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except:
        return None

def write_file(path, content):
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

def list_files():
    files = []
    for root, _, filenames in os.walk("."):
        for f in filenames:
            files.append(os.path.join(root, f))
    return files

def search_files(keyword):
    results = []
    for f in list_files():
        content = read_file(f)
        if content and keyword.lower() in content.lower():
            results.append(f)
    return results[:5]

# ---------- EXECUTION ----------

def run_command(cmd):
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        return result.stdout + result.stderr
    except Exception as e:
        return str(e)

# ---------- AI ----------

def ask_ai(messages):
    response = client.chat.completions.create(
        model=MODEL,
        messages=messages
    )
    return response.choices[0].message.content

# ---------- AGENT LOOP ----------

def agi_agent(goal):
    console.print(Panel(f"🧠 GOAL: {goal}", style="bold cyan"))

    state = {
        "goal": goal,
        "steps": [],
        "last_output": ""
    }

    for iteration in range(5):  # loop iterations
        console.print(f"\n🔁 Iteration {iteration+1}")

        # PLAN
        plan = ask_ai([
            {"role": "system", "content": "You are an autonomous coding agent. Plan next step."},
            {"role": "user", "content": f"Goal: {goal}\nCurrent state: {state}"}
        ])

        console.print(Panel(plan, title="📋 Plan"))

        # ACT (simple parsing)
        if "search" in plan.lower():
            keyword = plan.split()[-1]
            files = search_files(keyword)
            state["last_output"] = str(files)
            console.print(f"🔍 Found: {files}")

        elif "read" in plan.lower():
            files = search_files(goal)
            if files:
                content = read_file(files[0])
                state["last_output"] = content[:1000]
                console.print("📂 Read file")

        elif "run" in plan.lower():
            output = run_command("python app.py")
            state["last_output"] = output
            console.print("⚡ Ran command")

        elif "fix" in plan.lower():
            files = search_files(goal)
            if files:
                content = read_file(files[0])

                fixed = ask_ai([
                    {"role": "system", "content": "Fix errors and return corrected code only."},
                    {"role": "user", "content": content}
                ])

                write_file(files[0], fixed)
                console.print(f"✅ Fixed {files[0]}")

        # REFLECT
        reflection = ask_ai([
            {"role": "system", "content": "Evaluate progress. Is goal achieved? Answer YES/NO."},
            {"role": "user", "content": str(state)}
        ])

        console.print(f"🧠 Reflection: {reflection}")

        if "yes" in reflection.lower():
            console.print("🎉 Goal Achieved!")
            break

# ---------- CHAT UI ----------

chat_history = [
    {"role": "system", "content": "You are an AGI-level coding assistant."}
]

def chat():
    console.print(Panel("🚀 AGI DEV ASSISTANT READY", style="bold green"))

    while True:
        user_input = prompt("\n💬 You: ")

        if user_input in ["exit", "quit"]:
            break

        if user_input.startswith("agent "):
            goal = user_input.replace("agent ", "")
            agi_agent(goal)
            continue

        if user_input.startswith("run "):
            cmd = user_input.replace("run ", "")
            console.print(run_command(cmd))
            continue

        if user_input.startswith("search "):
            keyword = user_input.replace("search ", "")
            console.print(search_files(keyword))
            continue

        # normal chat
        chat_history.append({"role": "user", "content": user_input})
        reply = ask_ai(chat_history)
        console.print(Panel(reply, title="🤖 AI"))
        chat_history.append({"role": "assistant", "content": reply})

# ---------- START ----------

if __name__ == "__main__":
    chat()